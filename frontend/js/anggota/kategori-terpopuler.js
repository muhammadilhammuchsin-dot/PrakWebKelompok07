(() => {
  'use strict';
  const API_ENDPOINT =
    'anggota/kategori-terpopuler.php';
  const CATEGORIES = [
    {
      key: 'informatika',
      label: 'Informatika & Komputer',
      file: 'cari-informatika.html'
    },
    {
      key: 'sains',
      label: 'Sains & Matematika',
      file: 'cari-sains.html'
    },
    {
      key: 'sastra',
      label: 'Sastra & Bahasa',
      file: 'cari-sastra.html'
    },
    {
      key: 'sosial',
      label: 'Sosial & Bisnis',
      file: 'cari-sosial.html'
    }
  ];
  const $ = selector =>
    document.querySelector(selector);
  let requestInProgress = false;
  function showEmptyState(
    message = 'Belum ada data pencarian',
    status = 'empty'
  ) {
    const label = $('[data-popular-category]');
    const link = $('[data-popular-category-link]');
    if (!label || !link) {
      return;
    }
    label.textContent = message;
    label.dataset.status = status;
    label.title = message;
    link.hidden = true;
    link.removeAttribute('href');
    link.removeAttribute('data-route');
  }
  function renderPopularCategory(popular) {
    const label = $('[data-popular-category]');
    const link = $('[data-popular-category-link]');
    if (!label || !link) {
      return;
    }
    if (
      !popular ||
      Number(popular.total_activity) < 1
    ) {
      showEmptyState(
        'Belum ada data pencarian'
      );
      return;
    }
    const category = CATEGORIES.find(
      item => item.key === popular.key
    );
    if (!category) {
      showEmptyState(
        'Kategori belum dikenali',
        'invalid-category'
      );
      console.warn(
        '[Kategori Terpopuler] Kategori tidak dikenali:',
        popular
      );
      return;
    }
    label.textContent = category.label;
    label.dataset.status = 'loaded';
    const totalActivity = Number(
      popular.total_activity || 0
    );
    const totalMembers = Number(
      popular.total_members || 0
    );
    const percentage = Number(
      popular.percentage || 0
    );
    label.title =
      `${totalActivity} aktivitas pencarian, ` +
      `${totalMembers} anggota, ` +
      `${percentage}% dari seluruh pencarian`;
    link.href = category.file;
    link.dataset.route = category.file;
    link.hidden = false;
  }
  async function loadPopularCategory() {
    const label = $('[data-popular-category]');
    if (
      !label ||
      requestInProgress
    ) {
      return;
    }
    if (!window.EPerpus?.api?.get) {
      showEmptyState(
        'Modul API belum tersedia',
        'api-unavailable'
      );
      console.error(
        '[Kategori Terpopuler] EPerpus.api.get belum tersedia.'
      );
      return;
    }
    requestInProgress = true;
    label.textContent =
      'Memuat kategori terpopuler...';
    label.dataset.status = 'loading';
    try {
      const response = await window.EPerpus.api.get(
        API_ENDPOINT
      );
      if (
        !response?.success ||
        !response?.data
      ) {
        throw new Error(
          response?.message ||
          'Respons kategori terpopuler tidak valid.'
        );
      }
      renderPopularCategory(
        response.data.popular
      );
      console.info(
        '[E-PERPUSTAKAAN] KATEGORI TERPOPULER',
        {
          popular: response.data.popular,
          categories: response.data.categories,
          totalSearches:
            response.data.total_searches,
          scope: response.data.scope,
          source: response.data.source
        }
      );
      document.dispatchEvent(
        new CustomEvent(
          'eperpus:popular-category-updated',
          {
            detail: response.data
          }
        )
      );
    } catch (error) {
      console.error(
        '[Kategori Terpopuler] Gagal memuat:',
        error
      );
      showEmptyState(
        'Kategori terpopuler gagal dimuat',
        'error'
      );
    } finally {
      requestInProgress = false;
    }
  }
  function initialize() {
    if (!$('[data-popular-category]')) {
      return;
    }
    loadPopularCategory();
    window.addEventListener(
      'pageshow',
      loadPopularCategory
    );
    window.addEventListener(
      'focus',
      loadPopularCategory
    );
    document.addEventListener(
      'eperpus:data-updated',
      loadPopularCategory
    );
    window.addEventListener(
      'eperpus:search-history-updated',
      loadPopularCategory
    );
    document.addEventListener(
      'eperpus:search-completed',
      loadPopularCategory
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (!document.hidden) {
          loadPopularCategory();
        }
      }
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
