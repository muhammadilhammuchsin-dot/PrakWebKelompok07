(() => {
  'use strict';
  const $ = (selector, root = document) =>
    root.querySelector(selector);
  function categoryKey(value) {
    const text = String(value || '')
      .toLocaleLowerCase('id-ID');
    if (
      text.includes('informatika') ||
      text.includes('komputer') ||
      text.includes('teknologi')
    ) return 'informatika';
    if (
      text.includes('sains') ||
      text.includes('matematika')
    ) return 'sains';
    if (
      text.includes('sosial') ||
      text.includes('bisnis') ||
      text.includes('ekonomi') ||
      text.includes('manajemen')
    ) return 'sosial';
    if (
      text.includes('sastra') ||
      text.includes('bahasa')
    ) return 'sastra';
    return '';
  }
  function setText(selector, value) {
    const element = $(selector);
    if (element) {
      element.textContent = value ?? '—';
    }
  }
  function setButtonLabel(button, text) {
    if (!button) return;
    let label = button.querySelector(
      '[data-borrow-label]'
    );
    if (!label) {
      label = document.createElement('span');
      label.dataset.borrowLabel = 'true';
      Array.from(button.childNodes).forEach(node => {
        if (
          node.nodeType === Node.TEXT_NODE &&
          node.textContent.trim()
        ) {
          node.remove();
        }
      });
      button.appendChild(label);
    }
    label.textContent = text;
  }
  function showError(message) {
    const notice = $('[data-detail-message]');
    if (notice) {
      notice.textContent = message;
      notice.hidden = false;
    }
    setText(
      '[data-book-title]',
      'Buku tidak ditemukan'
    );
    setText('[data-book-id]', '—');
    setText('[data-book-author]', '—');
    setText('[data-book-category]', '—');
    setText('[data-book-stock]', '—');
    setText(
      '[data-book-description]',
      message
    );
    setText(
      '[data-book-borrow-count]',
      'Data peminjaman tidak tersedia'
    );
    const image = $('[data-book-image]');
    const placeholder =
      $('[data-book-cover-placeholder]');
    if (image) {
      image.hidden = true;
      image.removeAttribute('src');
    }
    if (placeholder) {
      placeholder.textContent = 'Sampul tidak tersedia';
      placeholder.hidden = false;
    }
    const borrow = $('[data-action="borrow"]');
    if (borrow) {
      borrow.disabled = true;
    }
    $('[data-related-books]')?.replaceChildren();
  }
  function renderCover(path, title, bookCode) {
    const image = $('[data-book-image]');
    const placeholder = $('[data-book-cover-placeholder]');
    if (!image || !placeholder) return;
    image.alt = `Sampul buku ${title}`;
    image.hidden = false;
    placeholder.hidden = true;
    if (window.EPerpusCovers?.setSource) {
      window.EPerpusCovers.setSource(image, path, bookCode, () => {
        image.hidden = true;
        image.removeAttribute('src');
        placeholder.textContent = 'Sampul buku belum tersedia';
        placeholder.hidden = false;
      });
    } else {
      image.hidden = true;
      image.removeAttribute('src');
      placeholder.textContent = 'Sampul buku belum tersedia';
      placeholder.hidden = false;
    }
  }
  function renderBorrowCount(book) {
    const element = $('[data-book-borrow-count]');
    if (!element) return;
    const rawCount =
      book.borrow_count ??
      book.jumlah_dipinjam ??
      0;
    const count = Number(rawCount);
    const safeCount =
      Number.isFinite(count) && count >= 0
        ? count
        : 0;
    element.dataset.count = String(safeCount);
    element.textContent =
      `Dipinjam ${safeCount}x`;
    const extra = $('[data-book-borrow-extra]');
    if (extra) {
      extra.textContent = '';
      extra.hidden = true;
    }
  }
  function renderBook(book) {
    const code = String(
      book.book_code ||
      book.id_buku ||
      ''
    );
    const title = String(
      book.title ||
      book.judul ||
      'Tanpa judul'
    );
    const author = String(
      book.penulis ||
      book.authors ||
      'Penulis belum dicantumkan'
    );
    const category = String(
      book.kategori ||
      book.category_name ||
      'Belum dikategorikan'
    );
    const stockValue =
      book.available_stock ??
      book.stok ??
      0;
    const stock = Number(stockValue);
    const safeStock =
      Number.isFinite(stock) && stock >= 0
        ? stock
        : 0;
    const description = String(
      book.description ||
      book.deskripsi ||
      'Deskripsi buku belum tersedia.'
    );
    setText('[data-book-title]', title);
    setText('[data-book-id]', code);
    setText('[data-book-author]', author);
    setText('[data-book-category]', category);
    setText('[data-book-stock]', String(safeStock));
    setText(
      '[data-book-description]',
      description
    );
    renderBorrowCount(book);
    renderCover(
      book.cover_path || book.gambar,
      title,
      code
    );
    const button = $('[data-action="borrow"]');
    if (button) {
      button.dataset.bookId = String(
        Number(book.id || book.book_id || 0)
      );
      button.dataset.bookCode = code;
      button.dataset.bookTitle = title;
      button.dataset.bookCategoryKey =
        categoryKey(category);
      button.dataset.bookStock = String(safeStock);
      button.disabled = safeStock <= 0;
      setButtonLabel(
        button,
        safeStock <= 0
          ? 'Stok Buku Habis'
          : 'Pinjam Buku'
      );
    }
    const notice = $('[data-detail-message]');
    if (notice) {
      notice.hidden = true;
    }
    document.title = `${title} - E-Perpustakaan`;
    document.dispatchEvent(
      new CustomEvent(
        'eperpus:book-loaded',
        {
          detail: book
        }
      )
    );
  }
  async function getRelatedBooks(currentBook) {
    const result = await window.EPerpus.api.get(
      'anggota/cari-buku.php',
      {
        page: 1,
        limit: 50
      }
    );
    const records = Array.isArray(result.data)
      ? result.data
      : [];
    const currentCode = String(
      currentBook.book_code ||
      currentBook.id_buku ||
      ''
    );
    const currentCategory = categoryKey(
      currentBook.kategori ||
      currentBook.category_name
    );
    return records.filter(row => {
      const code = String(
        row.book_code ||
        row.id_buku ||
        ''
      );
      const category = categoryKey(
        row.kategori ||
        row.category_name
      );
      const stock = Number(
        row.available_stock ??
        row.stok
      ) || 0;
      return (
        code !== currentCode &&
        category === currentCategory &&
        stock > 0
      );
    }).slice(0, 3);
  }
  function renderRelated(records) {
    const container = $('[data-related-books]');
    if (!container) return;
    container.replaceChildren();
    if (!records.length) {
      const message = document.createElement('p');
      message.className = 'related-books-empty';
      message.textContent =
        'Belum ada buku serupa yang tersedia dalam kategori ini.';
      container.appendChild(message);
      return;
    }
    records.forEach(row => {
      const code = String(
        row.book_code ||
        row.id_buku ||
        ''
      );
      const title = String(
        row.title ||
        row.judul ||
        'Tanpa judul'
      );
      const rawBorrowCount =
        row.borrow_count ??
        row.jumlah_dipinjam ??
        0;
      const numericBorrowCount = Number(rawBorrowCount);
      const borrowCount =
        Number.isFinite(numericBorrowCount) &&
        numericBorrowCount >= 0
          ? Math.floor(numericBorrowCount)
          : 0;
      const card = document.createElement('article');
      card.className = 'book-card book-card--related';
      const top = document.createElement('div');
      top.className =
        'book-card__top book-card__related-top';
      const figure = document.createElement('figure');
      figure.className =
        'cover cover--small cover--related';
      const coverPath = row.cover_path || row.gambar || '';
      const showCoverPlaceholder = () => {
        figure.classList.add('cover--placeholder');
        figure.textContent = 'Sampul belum tersedia';
      };
      if (coverPath || code) {
        const image = document.createElement('img');
        image.className = 'cover__image';
        image.alt = `Sampul buku ${title}`;
        image.loading = 'lazy';
        figure.appendChild(image);
        if (window.EPerpusCovers?.setSource) {
          window.EPerpusCovers.setSource(
            image,
            coverPath,
            code,
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
      body.className =
        'book-card__body book-card__related-body';
      const heading = document.createElement('h3');
      heading.className =
        'book-card__title book-card__title--small book-card__related-title';
      heading.textContent = title;
      const badge = document.createElement('span');
      badge.className =
        'badge book-card__borrowed book-card__related-borrowed';
      badge.textContent = `dipinjam ${borrowCount}x`;
      badge.setAttribute(
        'aria-label',
        `Buku telah dipinjam ${borrowCount} kali`
      );
      body.append(
        heading,
        badge
      );
      top.append(
        figure,
        body
      );
      const footer = document.createElement('div');
      footer.className =
        'book-card__footer book-card__related-footer';
      const link = document.createElement('a');
      link.className =
        'btn btn--light btn--block btn--small book-card__related-link';
      link.href =
        `detail.html?id=${encodeURIComponent(code)}`;
      link.dataset.route = link.getAttribute('href');
      link.textContent = 'Detail';
      footer.appendChild(link);
      card.append(
        top,
        footer
      );
      container.appendChild(card);
    });
  }
  async function initialize() {
    const code = (
      new URLSearchParams(window.location.search)
        .get('id') || ''
    ).trim();
    if (!code) {
      showError(
        'Kode buku tidak ditemukan. Kembali ke katalog dan pilih buku.'
      );
      return;
    }
    try {
      if (!window.EPerpus?.api?.get) {
        throw new Error(
          'Modul API belum dimuat.'
        );
      }
      const result = await window.EPerpus.api.get(
        'anggota/detail-buku.php',
        {
          book_code: code
        }
      );
      const book = result.data?.book;
      if (!result.success || !book) {
        throw new Error(
          result.message ||
          'Detail buku tidak ditemukan.'
        );
      }
      renderBook(book);
      const related = await getRelatedBooks(book)
        .catch(error => {
          console.warn(
            'Buku serupa belum dapat dimuat:',
            error
          );
          return [];
        });
      renderRelated(related);
    } catch (error) {
      console.error(
        'Gagal memuat detail buku:',
        error
      );
      showError(
        error.message ||
        'Detail buku gagal dimuat dari database.'
      );
    }
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
