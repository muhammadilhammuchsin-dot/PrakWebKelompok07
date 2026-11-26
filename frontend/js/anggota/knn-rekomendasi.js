(() => {
  'use strict';

  const API_ENDPOINT = 'anggota/knn-minat.php';

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  let refreshInProgress = false;

  // Menampilkan nama anggota pada halaman.
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

  // Menampilkan status informasi minat baca.
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

  // Menampilkan hasil klasifikasi KNN.
  function renderPrediction(data, responseMessage = '') {
    const element = $('[data-reading-interest]');

    if (!element) return;

    const status = data?.status;
    const prediction = data?.prediction;

    if (status === 'training_data_unavailable') {
      renderInterestStatus(
        'Belum tersedia',
        status,
        responseMessage ||
          'Data latih berlabel belum mencukupi untuk menjalankan klasifikasi KNN.'
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
          'Program studi dan riwayat peminjaman belum tersedia untuk proses klasifikasi.'
      );

      return;
    }

    if (status !== 'predicted') {
      renderInterestStatus(
        'Belum terdeteksi',
        status || 'unavailable',
        responseMessage ||
          'Hasil klasifikasi belum tersedia.'
      );

      return;
    }

    // Menampilkan kategori hasil prediksi.
    element.textContent = prediction.label;
    element.dataset.status = 'predicted';
    element.dataset.categoryKey = prediction.key || '';

    const method = data.method || {};
    const profile = data.member_profile || {};
    const voteCounts = data.vote_counts || {};
    const borrowCounts = profile.borrow_counts || {};

    // Menyiapkan ringkasan hasil voting.
    const voteSummary = Object.entries(voteCounts)
      .filter(([, votes]) => Number(votes) > 0)
      .map(
        ([label, votes]) =>
          `${label}: ${votes}`
      )
      .join(', ');

    // Menyiapkan ringkasan jumlah peminjaman.
    const borrowingSummary = [
      [
        'Teknologi & Informatika',
        borrowCounts.teknologi || 0
      ],
      [
        'Sains & Matematika',
        borrowCounts.sains || 0
      ],
      [
        'Sastra & Bahasa',
        borrowCounts.sastra || 0
      ],
      [
        'Sosial & Bisnis',
        borrowCounts.sosial || 0
      ]
    ]
      .map(
        ([label, count]) =>
          `${label}: ${count}`
      )
      .join(', ');

    // Menyediakan informasi hasil klasifikasi.
    element.title = [
      method.name || 'K-Nearest Neighbor (KNN)',

      `Dasar: ${
        method.basis ||
        'Program studi dan riwayat peminjaman'
      }`,

      `Pengukuran jarak: ${
        method.distance_metric ||
        'Euclidean Distance'
      }`,

      `Nilai K: ${
        method.k_used ||
        method.k_requested ||
        '-'
      }`,

      `Data latih: ${
        method.training_data_size || 0
      } anggota`,

      `Hasil voting: ${
        prediction.votes || 0
      } dari ${
        method.k_used || 0
      } tetangga (${
        prediction.vote_percentage || 0
      }%)`,

      `Suara kategori: ${
        voteSummary || 'Belum tersedia'
      }`,

      `Program studi: ${
        profile.study_program ||
        'Tidak tersedia'
      }`,

      `Total peminjaman: ${
        profile.total_borrowings || 0
      }`,

      `Riwayat kategori: ${borrowingSummary}`,

      method.tie_break_applied
        ? 'Pemutus seri digunakan berdasarkan jarak tetangga.'
        : ''
    ]
      .filter(Boolean)
      .join(' | ');
  }

  // Mengambil data dan memperbarui informasi minat baca.
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

    // Memeriksa ketersediaan modul API.
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

      // Memeriksa identitas anggota yang sedang login.
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

      // Mengambil hasil klasifikasi dari backend.
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

      // Menampilkan hasil prediksi KNN.
      renderPrediction(
        response.data,
        response.message
      );

      // Mencatat hasil klasifikasi untuk pemeriksaan.
      console.info(
        'Minat Baca Personal:',
        {
          status: response.data.status,
          prediction: response.data.prediction,
          method: response.data.method,
          memberProfile: response.data.member_profile,
          categoryStatistics:
            response.data.category_statistics,
          voteCounts: response.data.vote_counts,
          neighbors: response.data.neighbors
        }
      );

      // Mengirimkan event pembaruan informasi minat baca.
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

  // Menjalankan proses ketika halaman dibuka.
  function initialize() {
    if (!$('[data-reading-interest]')) {
      return;
    }

    refreshInterest();

    // Memperbarui data ketika halaman kembali dibuka.
    window.addEventListener(
      'pageshow',
      refreshInterest
    );

    // Memperbarui data ketika browser mendapatkan fokus.
    window.addEventListener(
      'focus',
      refreshInterest
    );

    // Memperbarui data ketika halaman kembali aktif.
    document.addEventListener(
      'visibilitychange',
      () => {
        if (!document.hidden) {
          refreshInterest();
        }
      }
    );

    // Memperbarui minat baca setelah transaksi peminjaman.
    document.addEventListener(
      'eperpus:loan-created',
      refreshInterest
    );

    // Memperbarui data setelah terjadi perubahan sistem.
    document.addEventListener(
      'eperpus:data-updated',
      refreshInterest
    );
  }

  // Memastikan elemen HTML telah siap digunakan.
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