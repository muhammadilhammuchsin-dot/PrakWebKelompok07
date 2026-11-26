// Pengelolaan buku pustakawan melalui API PHP dan MySQL.
(() => {
  'use strict';
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const $ = (selector, root = document) =>
    root.querySelector(selector);
  let previewUrl = null;
  function api() {
    if (!window.EPerpus?.api) {
      throw new Error(
        'Modul API belum dimuat. Pastikan shared/app.js tersedia.'
      );
    }
    return window.EPerpus.api;
  }
  function showFeedback(message, type = 'success') {
    const element = $('#bookFeedback');
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
    element.className =
      `pb-feedback${message ? ` pb-feedback--${type}` : ''}`;
  }
  function clearPreview() {
    const preview = $('#coverPreview');
    const placeholder = $('#uploadPlaceholder');
    if (preview) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      previewUrl = null;
      preview.removeAttribute('src');
      preview.hidden = true;
    }
    if (placeholder) {
      placeholder.hidden = false;
    }
  }
  function initializePreview() {
    const input = $('#gambar');
    const preview = $('#coverPreview');
    const placeholder = $('#uploadPlaceholder');
    if (!input || !preview || !placeholder) return;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      showFeedback('');
      if (!file) {
        clearPreview();
        return;
      }
      const allowed = [
        'image/jpeg',
        'image/png',
        'image/webp'
      ];
      if (!allowed.includes(file.type)) {
        input.value = '';
        clearPreview();
        showFeedback(
          'Format sampul harus JPG, PNG, atau WEBP.',
          'error'
        );
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        input.value = '';
        clearPreview();
        showFeedback(
          'Ukuran gambar maksimal 5 MB.',
          'error'
        );
        return;
      }
      clearPreview();
      previewUrl = URL.createObjectURL(file);
      preview.src = previewUrl;
      preview.hidden = false;
      placeholder.hidden = true;
    });
  }
  function validateForm(form) {
    const id = form.elements.namedItem('id_buku')
      .value.trim().toUpperCase();
    const title = form.elements.namedItem('judul')
      .value.trim();
    const author = form.elements.namedItem('penulis')
      .value.trim();
    const category = form.elements.namedItem('kategori')
      .value;
    const stockText = form.elements.namedItem('stok')
      .value.trim();
    const stock = Number(stockText);
    if (
      !id ||
      !title ||
      !author ||
      !category ||
      stockText === ''
    ) {
      showFeedback(
        'Lengkapi ID buku, judul, penulis, kategori, dan stok.',
        'error'
      );
      return false;
    }
    if (!/^[A-Z0-9_-]{2,50}$/.test(id)) {
      showFeedback(
        'ID buku harus 2–50 karakter dan hanya berisi huruf, angka, - atau _.',
        'error'
      );
      return false;
    }
    if (
      !Number.isSafeInteger(stock) ||
      stock < 0
    ) {
      showFeedback(
        'Stok harus bilangan bulat nol atau lebih.',
        'error'
      );
      return false;
    }
    const file = form.elements.namedItem('gambar')
      .files?.[0];
    if (file) {
      if (![
        'image/jpeg',
        'image/png',
        'image/webp'
      ].includes(file.type)) {
        showFeedback(
          'Format sampul harus JPG, PNG, atau WEBP.',
          'error'
        );
        return false;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        showFeedback(
          'Ukuran gambar maksimal 5 MB.',
          'error'
        );
        return false;
      }
    }
    return true;
  }
  async function submitBook(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('#saveBookButton');
    if (!validateForm(form)) return;
    const file = form.elements.namedItem('gambar')
      .files?.[0] || null;
    const body = new FormData();
    body.append(
      'id_buku',
      form.elements.namedItem('id_buku')
        .value.trim().toUpperCase()
    );
    body.append(
      'judul',
      form.elements.namedItem('judul').value.trim()
    );
    body.append(
      'penulis',
      form.elements.namedItem('penulis').value.trim()
    );
    body.append(
      'kategori',
      form.elements.namedItem('kategori').value
    );
    body.append(
      'stok',
      form.elements.namedItem('stok').value
    );
    body.append(
      'deskripsi',
      form.elements.namedItem('deskripsi').value.trim()
    );
    if (file) {
      body.append('gambar', file);
    }
    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Menyimpan...';
      }
      showFeedback('');
      const result = await api().upload(
        'pustakawan/tambah-buku.php',
        body
      );
      showFeedback(
        result.message || 'Buku berhasil disimpan.',
        'success'
      );
      form.reset();
      clearPreview();
      window.setTimeout(() => {
        window.location.href = 'beranda.html';
      }, 700);
    } catch (error) {
      console.error(
        'Gagal menyimpan buku:',
        error
      );
      showFeedback(
        error.message || 'Buku gagal disimpan ke database.',
        'error'
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Simpan';
      }
    }
  }
  async function getBooks() {
    const result = await api().get(
      'pustakawan/daftar-buku.php'
    );
    if (!result || result.success !== true) {
      throw new Error(
        result?.message || 'Backend gagal mengirim daftar buku.'
      );
    }
    if (!Array.isArray(result.data)) {
      throw new Error(
        'Format daftar buku dari backend tidak sesuai.'
      );
    }
    return result.data;
  }
  function setDetail(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value || '-';
    }
  }
  function createHomeCard(book) {
    const titleText =
      book.judul || book.title || 'Tanpa judul';
    const imagePath = book.cover_path || book.gambar || '';
    const bookCode = book.book_code || book.id_buku || book.id || '';
    const authorText =
      book.penulis || book.authors || 'Penulis belum dicantumkan';
    const categoryText =
      book.kategori || book.category_name || 'Belum dikategorikan';
    const stockValue =
      Number(book.available_stock ?? book.stok) || 0;
    const descriptionText =
      book.deskripsi || book.description || 'Tidak ada deskripsi.';
    const card = document.createElement('article');
    card.className = 'book-card book-card--added';
    const figure = document.createElement('figure');
    figure.className = 'cover cover--banner';
    const showCoverPlaceholder = () => {
      figure.classList.add('cover--placeholder');
      figure.textContent = 'Sampul belum tersedia';
    };
    if (imagePath || bookCode) {
      const image = document.createElement('img');
      image.className = 'cover__image';
      image.alt = `Sampul buku ${titleText}`;
      image.loading = 'lazy';
      figure.appendChild(image);
      if (window.EPerpusCovers?.setSource) {
        window.EPerpusCovers.setSource(
          image,
          imagePath,
          bookCode,
          () => {
            image.remove();
            showCoverPlaceholder();
          }
        );
      } else {
        image.remove();
        showCoverPlaceholder();
      }
    } else {
      showCoverPlaceholder();
    }
    const title = document.createElement('h3');
    title.className = 'book-card__title';
    title.textContent = titleText;
    const stock = document.createElement('span');
    stock.className = 'badge';
    stock.textContent =
      `Stok Tersedia ${stockValue} Eks`;
    const detail = document.createElement('button');
    detail.type = 'button';
    detail.className =
      'btn btn--navy btn--block btn--small';
    detail.dataset.bookDetail = '';
    detail.dataset.bookTitle = titleText;
    detail.dataset.bookAuthor = authorText;
    detail.dataset.bookCategory = categoryText;
    detail.dataset.bookStock =
      `${stockValue} eksemplar`;
    detail.dataset.bookDescription = descriptionText;
    detail.setAttribute(
      'aria-label',
      `Lihat detail buku ${titleText}`
    );
    const eyeIcon = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    );
    eyeIcon.setAttribute('aria-hidden', 'true');
    eyeIcon.setAttribute('class', 'icon icon--sm');
    const eyeUse = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'use'
    );
    eyeUse.setAttribute('href', '#i-eye');
    eyeIcon.appendChild(eyeUse);
    const detailLabel = document.createElement('span');
    detailLabel.textContent = 'Detail';
    detail.append(eyeIcon, detailLabel);
    card.append(
      figure,
      title,
      stock,
      detail
    );
    return card;
  }
  async function renderHomeBooks() {
    const container = $('[data-home-book-list]');
    if (!container) return;
    container.textContent = 'Memuat data stok buku...';
    try {
      const books = await getBooks();
      const available = books
        .filter(book =>
          Number(book.available_stock ?? book.stok) > 0
        )
        .sort((a, b) =>
          String(b.created_at || '').localeCompare(
            String(a.created_at || '')
          )
        );
      container.replaceChildren();
      if (!available.length) {
        const empty = document.createElement('p');
        empty.className = 'pb-stock-empty';
        empty.textContent = books.length
          ? 'Belum ada buku dengan stok tersedia.'
          : 'Belum ada buku yang ditambahkan.';
        container.appendChild(empty);
        return;
      }
      const fragment = document.createDocumentFragment();
      available.forEach(book => {
        fragment.appendChild(
          createHomeCard(book)
        );
      });
      container.appendChild(fragment);
    } catch (error) {
      console.error(
        'Gagal memuat stok buku:',
        error
      );
      container.textContent =
        error.message || 'Data buku gagal dimuat dari backend.';
    }
  }
  function initialize() {
    const form = $('#bookForm');
    if (form) {
      initializePreview();
      form.addEventListener(
        'submit',
        submitBook
      );
    }
    renderHomeBooks();
  }
  document.addEventListener('click', event => {
    const target = event.target instanceof Element
      ? event.target
      : null;
    if (!target) return;
    const detailButton =
      target.closest('[data-book-detail]');
    if (detailButton) {
      setDetail(
        'bookDetailTitle',
        detailButton.dataset.bookTitle
      );
      setDetail(
        'bookDetailAuthor',
        detailButton.dataset.bookAuthor
      );
      setDetail(
        'bookDetailCategory',
        detailButton.dataset.bookCategory
      );
      setDetail(
        'bookDetailStock',
        detailButton.dataset.bookStock
      );
      setDetail(
        'bookDetailDescription',
        detailButton.dataset.bookDescription
      );
      $('#bookDetailDialog')?.showModal();
    }
    if (target.closest('[data-close-book-detail]')) {
      $('#bookDetailDialog')?.close();
    }
  });
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }
})();
