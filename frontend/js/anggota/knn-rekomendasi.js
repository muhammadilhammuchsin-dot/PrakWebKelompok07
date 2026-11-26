(() => {
  'use strict';
  const API_ENDPOINT = 'anggota/knn-minat.php';
  const $ = (selector, root = document) =>
    root.querySelector(selector);
  let refreshInProgress = false;
  function renderMemberName(user) {
    const name = String(
      user?.name ||
      user?.full_name ||
      user?.nama ||
      'Anggota'
    ).trim();
    document
      .querySelectorAll('[data-member-name]')
      .forEach(element => {
        element.textContent = name || 'Anggota';
      });
  }
  function renderInterestStatus(
    message,
    status = 'unavailable',
    detail = ''
  ) {
    const element = $('[data-reading-interest]');
    if (!element) return;
    element.textContent = message;
    element.dataset.status = status;
    element.title = detail || message;
    delete element.dataset.categoryKey;
  }
  function renderPrediction(data, responseMessage = '') {
    const element = $('[data-reading-interest]');
    if (!element) return;
    const status = data?.status;
    const prediction = data?.prediction;
    if (status === 'insufficient_member_history') {
      renderInterestStatus(
        'Belum tersedia',
        status,
        responseMessage ||
        'Minat baca tersedia setelah minimal tiga transaksi peminjaman berkategori.'
      );
      return;
    }
    if (status === 'ambiguous_interest') {
      const categories = Array.isArray(
        data.top_categories
      )
        ? data.top_categories.join(', ')
        : 'Beberapa kategori';
      renderInterestStatus(
        'Minat baca belum dapat ditentukan',
        status,
        `Jumlah peminjaman tertinggi sama pada kategori: ${categories}`
      );
      return;
    }
    if (
      status === 'no_member_features' ||
      !prediction?.label
    ) {
      renderInterestStatus(
        'Belum tersedia',
        status || 'unavailable',
        responseMessage ||
        'Belum terdapat riwayat peminjaman yang dapat dikategorikan.'
      );
      return;
    }
    if (status !== 'predicted') {
      renderInterestStatus(
        'Belum terdeteksi',
        status || 'unavailable'
      );
      return;
    }
    element.textContent = prediction.label;
    element.dataset.status = 'predicted';
    element.dataset.categoryKey = prediction.key || '';
    const method = data.method || {};
    const profile = data.member_profile || {};
    element.title = [
      method.name ||
        'Dominasi Frekuensi Peminjaman',
      method.basis ||
        'Riwayat peminjaman pribadi',
      method.rule ||
        'Kategori dengan jumlah peminjaman terbanyak',
      `Total peminjaman: ${
        profile.total_borrowings || 0
      }`,
      `Peminjaman kategori dominan: ${
        prediction.total_borrowings || 0
      }`,
      `Persentase dominasi: ${
        prediction.percentage || 0
      }%`
    ].join(' | ');
  }
  async function refreshInterest() {
    const interestElement = $(
      '[data-reading-interest]'
    );
    if (
      !interestElement ||
      refreshInProgress
    ) {
      return;
    }
    if (
      !window.EPerpus ||
      typeof window.EPerpus.getCurrentUser !== 'function' ||
      typeof window.EPerpus.api?.get !== 'function'
    ) {
      renderInterestStatus(
        'Belum terdeteksi',
        'api-unavailable',
        'Modul API belum tersedia.'
      );
      return;
    }
    refreshInProgress = true;
    try {
      renderInterestStatus(
        'Memuat minat baca...',
        'loading'
      );
      const user = await window.EPerpus.getCurrentUser(true);
      if (
        !user ||
        user.role !== 'anggota'
      ) {
        renderInterestStatus(
          'Belum terdeteksi',
          'unauthenticated'
        );
        return;
      }
      renderMemberName(user);
      const response = await window.EPerpus.api.get(
        API_ENDPOINT
      );
      if (
        !response?.success ||
        !response?.data
      ) {
        throw new Error(
          response?.message ||
          'Data minat baca tidak tersedia.'
        );
      }
      renderPrediction(
        response.data,
        response.message
      );
      console.info(
        'Minat Baca Personal:',
        {
          status: response.data.status,
          prediction: response.data.prediction,
          method: response.data.method,
          memberProfile: response.data.member_profile,
          categoryStatistics:
            response.data.category_statistics
        }
      );
      document.dispatchEvent(
        new CustomEvent(
          'eperpus:interest-updated',
          {
            detail: response.data
          }
        )
      );
    } catch (error) {
      console.error(
        'Gagal memuat minat baca:',
        error
      );
      renderInterestStatus(
        'Belum terdeteksi',
        'error',
        error.message ||
        'Terjadi kesalahan saat menghitung minat baca.'
      );
    } finally {
      refreshInProgress = false;
    }
  }
  function initialize() {
    if (!$('[data-reading-interest]')) {
      return;
    }
    refreshInterest();
    window.addEventListener(
      'pageshow',
      refreshInterest
    );
    window.addEventListener(
      'focus',
      refreshInterest
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (!document.hidden) {
          refreshInterest();
        }
      }
    );
    document.addEventListener(
      'eperpus:loan-created',
      refreshInterest
    );
    document.addEventListener(
      'eperpus:data-updated',
      refreshInterest
    );
  }
  if (
    document.readyState === 'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }
})();
