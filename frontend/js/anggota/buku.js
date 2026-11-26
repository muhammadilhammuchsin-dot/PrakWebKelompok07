(() => {
  'use strict';
  if (window.__EPerpusBookCatalogInitialized) {
    console.warn('E-Perpustakaan: buku.js sudah diinisialisasi.');
    return;
  }
  window.__EPerpusBookCatalogInitialized = true;
  const $ = (selector, root = document) =>
    root.querySelector(selector);
  const grid = $('.book-grid--two') || $('.book-grid');
  const searchInput = $('#keyword');
  const searchButton = $('[data-action="search"]');
  const categories = [
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
      key: 'sosial',
      label: 'Sosial & Bisnis',
      file: 'cari-sosial.html'
    },
    {
      key: 'sastra',
      label: 'Sastra & Bahasa',
      file: 'cari-sastra.html'
    }
  ];
  let books = [];
  let selectedCategory = 'all';
  function categoryKey(value) {
    const text = String(value || '')
      .toLocaleLowerCase('id-ID');
    if (
      text.includes('informatika') ||
      text.includes('komputer') ||
      text.includes('teknologi') ||
      text.includes('sistem informasi')
    ) {
      return 'informatika';
    }
    if (
      text.includes('sains') ||
      text.includes('matematika')
    ) {
      return 'sains';
    }
    if (
      text.includes('sosial') ||
      text.includes('bisnis') ||
      text.includes('ekonomi') ||
      text.includes('manajemen')
    ) {
      return 'sosial';
    }
    if (
      text.includes('sastra') ||
      text.includes('bahasa')
    ) {
      return 'sastra';
    }
    return '';
  }
  function normalizeBook(row) {
    const category = String(
      row.kategori ??
      row.category_name ??
      row.category ??
      'Belum dikategorikan'
    );
    return {
      code: String(
        row.book_code ??
        row.id_buku ??
        row.id ??
        ''
      ),
      title: String(
        row.title ??
        row.judul ??
        'Tanpa judul'
      ),
      author: String(
        row.authors ??
        row.penulis ??
        row.author ??
        ''
      ),
      category,
      categoryKey: categoryKey(category),
      description: String(
        row.description ??
        row.deskripsi ??
        ''
      ),
      coverPath: row.cover_path ?? row.gambar ?? '',
      borrowCount: Math.max(
        0,
        Number(
          row.borrow_count ??
          row.jumlah_dipinjam ??
          row.borrowCount ??
          0
        ) || 0
      ),
      stock: Math.max(
        0,
        Number(
          row.available_stock ??
          row.stok ??
          0
        ) || 0
      ),
      isbn: String(row.isbn || '')
    };
  }
  async function getBooks(params = {}) {
    if (!window.EPerpus?.api?.get) {
      throw new Error(
        'Modul API belum terbaca. Pastikan app.js dimuat sebelum buku.js.'
      );
    }
    const first = await window.EPerpus.api.get(
      'anggota/cari-buku.php',
      {
        page: 1,
        limit: 50,
        ...params
      }
    );
    const records = Array.isArray(first.data)
      ? [...first.data]
      : [];
    const totalPages = Math.max(
      1,
      Number(first.pagination?.total_pages) || 1
    );
    for (
      let page = 2;
      page <= totalPages;
      page += 1
    ) {
      const result = await window.EPerpus.api.get(
        'anggota/cari-buku.php',
        {
          page,
          limit: 50,
          ...params
        }
      );
      if (Array.isArray(result.data)) {
        records.push(...result.data);
      }
    }
    return records.map(normalizeBook);
  }
  function showMessage(message) {
    if (!grid) return;
    const paragraph = document.createElement('p');
    paragraph.className = 'catalog-empty-state';
    paragraph.setAttribute('role', 'status');
    paragraph.textContent = message;
    paragraph.style.gridColumn = '1 / -1';
    grid.replaceChildren(paragraph);
  }
  function createCard(book) {
    const card = document.createElement('article');
    card.className = 'book-card book-card--wide';
    card.dataset.bookId = book.code;
    const top = document.createElement('div');
    top.className = 'book-card__top';
    const figure = document.createElement('figure');
    figure.className = 'cover cover--small';
    const showCoverPlaceholder = () => {
      figure.classList.add('cover--placeholder');
      figure.textContent = 'Sampul belum tersedia';
    };
    if (book.coverPath || book.code) {
      const image = document.createElement('img');
      image.className = 'cover__image';
      image.alt = `Sampul buku ${book.title}`;
      image.loading = 'lazy';
      figure.appendChild(image);
      if (window.EPerpusCovers?.setSource) {
        window.EPerpusCovers.setSource(
          image,
          book.coverPath,
          book.code,
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
    const body = document.createElement('div');
    body.className = 'book-card__body';
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = book.category;
    const title = document.createElement('h3');
    title.className = 'book-card__title';
    title.textContent = book.title;
    const author = document.createElement('p');
    author.className = 'book-card__author';
    author.textContent =
      book.author || 'Penulis belum dicantumkan';
    const borrowed = document.createElement('span');
    borrowed.className =
      'badge book-card__borrowed';
    borrowed.textContent =
      `dipinjam ${book.borrowCount}x`;
    borrowed.setAttribute(
      'aria-label',
      `Telah dipinjam ${book.borrowCount} kali`
    );
    body.append(
      tag,
      title,
      author,
      borrowed
    );
    top.append(
      figure,
      body
    );
    const footer = document.createElement('div');
    footer.className = 'book-card__footer';
    const link = document.createElement('a');
    link.className = 'btn btn--navy btn--small';
    link.href =
      `detail.html?id=${encodeURIComponent(book.code)}`;
    link.dataset.route = link.getAttribute('href');
    link.setAttribute(
      'aria-label',
      `Detail buku ${book.title}`
    );
    const linkText = document.createElement('span');
    linkText.textContent = 'Detail';
    const arrow = document.createElement('span');
    arrow.className = 'book-card__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    link.append(
      linkText,
      arrow
    );
    footer.appendChild(link);
    card.append(
      top,
      footer
    );
    return card;
  }
  function render() {
    if (!grid) return;
    const keyword = String(
      searchInput?.value || ''
    )
      .trim()
      .toLocaleLowerCase('id-ID');
    const words = keyword
      .split(/\s+/)
      .filter(Boolean);
    const filtered = books.filter(book => {
      const categoryMatches =
        selectedCategory === 'all' ||
        book.categoryKey === selectedCategory;
      const searchableText = [
        book.code,
        book.title,
        book.author,
        book.category,
        book.description,
        book.isbn
      ]
        .join(' ')
        .toLocaleLowerCase('id-ID');
      const keywordMatches = words.every(
        word => searchableText.includes(word)
      );
      return categoryMatches && keywordMatches;
    });
    if (!filtered.length) {
      showMessage(
        books.length
          ? 'Tidak ada buku yang sesuai dengan pencarian atau kategori ini.'
          : 'Belum ada buku yang ditambahkan oleh Pustakawan.'
      );
      return;
    }
    const fragment =
      document.createDocumentFragment();
    filtered.forEach(book => {
      fragment.appendChild(
        createCard(book)
      );
    });
    grid.replaceChildren(fragment);
  }
  async function searchOnServer() {
    const keyword = String(
      searchInput?.value || ''
    ).trim();
    const selected = categories.find(
      item => item.key === selectedCategory
    );
    const params = {};
    if (keyword) {
      params.keyword = keyword;
    }
    if (selected) {
      params.kategori = selected.label;
    }
    try {
      showMessage('Mencari buku...');
      books = await getBooks(params);
      render();
    } catch (error) {
      console.error(
        'Pencarian buku gagal:',
        error
      );
      window.EPerpus?.notify(
        error.message || 'Pencarian buku gagal.',
        'error'
      );
      showMessage(
        error.message ||
        'Pencarian buku gagal. Periksa koneksi backend.'
      );
    }
  }
  async function initialize() {
    if (!grid) return;
    const filename = window.location.pathname
      .split('/')
      .pop()
      .toLowerCase();
    selectedCategory = categories.find(
      item => item.file === filename
    )?.key || 'all';
    showMessage(
      'Memuat katalog buku dari database...'
    );
    try {
      const initialCategory = categories.find(
        item => item.key === selectedCategory
      );
      const initialParams = initialCategory
        ? {
            kategori: initialCategory.label
          }
        : {};
      books = await getBooks(initialParams);
      render();
    } catch (error) {
      console.error(
        'Katalog buku gagal dimuat:',
        error
      );
      showMessage(
        error.message ||
        'Katalog buku gagal dimuat. Periksa koneksi backend.'
      );
    }
    searchInput?.addEventListener(
      'input',
      render
    );
    searchButton?.addEventListener(
      'click',
      searchOnServer
    );
    searchInput?.addEventListener(
      'keydown',
      event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          searchOnServer();
        }
      }
    );
  }
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
