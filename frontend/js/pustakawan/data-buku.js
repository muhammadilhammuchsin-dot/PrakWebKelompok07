(() => {
  'use strict';
  const $ = (selector, root = document) =>
    root.querySelector(selector);
  const tableBody = $('#bookTableBody');
  const countLabel = $('#bookCount');
  const searchForm = $('#bookSearchForm');
  const searchInput = $('#bookSearchInput');
  const feedback = $('#bookFeedback');
  const dialog = $('#editBookDialog');
  const editForm = $('#editBookForm');
  const editCode = $('#editBookCode');
  const editTitle = $('#editBookName');
  const editCategory = $('#editBookCategory');
  const editStock = $('#editBookStock');
  const editFeedback = $('#editBookFeedback');
  let books = [];
  let editingCode = null;
  function api() {
    if (!window.EPerpus) {
      throw new Error(
        'Modul EPerpus belum dimuat. Periksa urutan script app.js.'
      );
    }
    if (!window.EPerpus.api) {
      throw new Error(
        'Koneksi API belum tersedia.'
      );
    }
    return window.EPerpus.api;
  }
  async function getBooks() {
    const result = await api().get(
      'pustakawan/daftar-buku.php'
    );
    if (!result || result.success !== true) {
      throw new Error(
        result?.message ||
        'Backend gagal mengirim data buku.'
      );
    }
    if (!Array.isArray(result.data)) {
      throw new Error(
        'Format data buku dari backend tidak sesuai.'
      );
    }
    return result.data;
  }
  function normalizeBook(row) {
    return {
      code: String(
        row.id_buku ||
        row.book_code ||
        ''
      ),
      title: String(
        row.judul ||
        row.title ||
        'Tanpa judul'
      ),
      author: String(
        row.penulis ||
        row.authors ||
        ''
      ),
      category: String(
        row.kategori ||
        row.category_name ||
        'Belum dikategorikan'
      ),
      stock: Number(
        row.stok ??
        row.available_stock ??
        0
      ),
      description: String(
        row.deskripsi ||
        row.description ||
        ''
      ),
      databaseId: Number(row.id) || null
    };
  }
  function showFeedback(
    message,
    type = 'success'
  ) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.hidden = !message;
    feedback.classList.toggle(
      'db-feedback--error',
      type === 'error'
    );
  }
  function showEditFeedback(message) {
    if (!editFeedback) return;
    editFeedback.textContent = message;
    editFeedback.hidden = !message;
  }
  function icon(symbolId) {
    const svg = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    );
    svg.classList.add('icon');
    svg.setAttribute(
      'aria-hidden',
      'true'
    );
    const use = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'use'
    );
    use.setAttribute(
      'href',
      `#${symbolId}`
    );
    svg.appendChild(use);
    return svg;
  }
  function actionButton(
    action,
    label,
    symbol,
    variant,
    code
  ) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className =
      `db-action-button db-action-button--${variant}`;
    button.dataset[action] = code;
    button.setAttribute(
      'aria-label',
      `${label} buku ${code}`
    );
    button.append(
      icon(symbol),
      document.createTextNode(label)
    );
    return button;
  }
  function createRow(book) {
    const row = document.createElement('tr');
    const codeCell = document.createElement('td');
    const code = document.createElement('span');
    code.className = 'db-book-code';
    code.textContent = book.code;
    codeCell.appendChild(code);
    const titleCell = document.createElement('td');
    const title = document.createElement('span');
    title.className = 'db-book-title';
    title.textContent = book.title;
    titleCell.appendChild(title);
    const categoryCell = document.createElement('td');
    const category = document.createElement('span');
    category.className = 'db-category';
    if (
      book.category.toLowerCase().includes('sosial')
    ) {
      category.classList.add(
        'db-category--social'
      );
    }
    const dot = document.createElement('span');
    dot.className = 'db-category__dot';
    dot.setAttribute(
      'aria-hidden',
      'true'
    );
    const categoryText =
      document.createElement('span');
    categoryText.textContent = book.category;
    category.append(
      dot,
      categoryText
    );
    categoryCell.appendChild(category);
    const stockCell = document.createElement('td');
    const stock = document.createElement('span');
    stock.className = 'db-stock';
    if (book.stock <= 0) {
      stock.classList.add(
        'db-stock--empty'
      );
      stock.textContent = '0 (Habis)';
    } else {
      stock.textContent =
        `${book.stock} Eks`;
    }
    stockCell.appendChild(stock);
    const actionCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'db-actions';
    actions.append(
      actionButton(
        'editBook',
        'Edit',
        'i-edit',
        'edit',
        book.code
      ),
      actionButton(
        'deleteBook',
        'Hapus',
        'i-trash',
        'delete',
        book.code
      )
    );
    actionCell.appendChild(actions);
    row.append(
      codeCell,
      titleCell,
      categoryCell,
      stockCell,
      actionCell
    );
    return row;
  }
  function filteredBooks() {
    const keyword = String(
      searchInput?.value || ''
    )
      .trim()
      .toLocaleLowerCase('id-ID');
    if (!keyword) return books;
    return books.filter(book => {
      return [
        book.code,
        book.title,
        book.category,
        book.author
      ].some(value =>
        String(value)
          .toLocaleLowerCase('id-ID')
          .includes(keyword)
      );
    });
  }
  function renderTable() {
    if (!tableBody) return;
    const filtered = filteredBooks();
    const fragment =
      document.createDocumentFragment();
    if (filtered.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.className = 'db-empty';
      cell.textContent = books.length > 0
        ? 'Buku yang dicari tidak ditemukan.'
        : 'Belum ada data buku.';
      row.appendChild(cell);
      fragment.appendChild(row);
    } else {
      filtered.forEach(book => {
        fragment.appendChild(
          createRow(book)
        );
      });
    }
    tableBody.replaceChildren(fragment);
    if (countLabel) {
      countLabel.textContent =
        `Menampilkan ${filtered.length} dari ${books.length} buku`;
    }
  }
  function showLoading() {
    if (!tableBody) return;
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'db-loading';
    cell.textContent = 'Memuat data buku dari database...';
    row.appendChild(cell);
    tableBody.replaceChildren(row);
    if (countLabel) {
      countLabel.textContent = 'Memuat data...';
    }
  }
  function showLoadError(error) {
    console.error(
      'DETAIL ERROR DATA BUKU:',
      error
    );
    const message = error instanceof Error
      ? error.message
      : String(error);
    if (tableBody) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.className = 'db-empty';
      cell.textContent =
        'Gagal memuat data: ' + message;
      row.appendChild(cell);
      tableBody.replaceChildren(row);
    }
    if (countLabel) {
      countLabel.textContent =
        'Data tidak tersedia';
    }
    showFeedback(
      'Penyebab: ' + message,
      'error'
    );
  }
  async function loadBooks() {
    showLoading();
    const rows = await getBooks();
    books = rows
      .map(normalizeBook)
      .filter(book => book.code)
      .sort((a, b) =>
        a.code.localeCompare(
          b.code,
          'id',
          { numeric: true }
        )
      );
    renderTable();
  }
  function openEdit(code) {
    const book = books.find(
      item => item.code === code
    );
    if (
      !book ||
      !dialog ||
      !editForm
    ) {
      return;
    }
    editingCode = book.code;
    editCode.value = book.code;
    editTitle.value = book.title;
    editStock.value = String(book.stock);
    const exists = Array.from(
      editCategory.options
    ).some(option =>
      option.value === book.category
    );
    if (!exists) {
      const option = document.createElement('option');
      option.value = book.category;
      option.textContent = book.category;
      editCategory.appendChild(option);
    }
    editCategory.value = book.category;
    showEditFeedback('');
    dialog.showModal();
  }
  function closeEdit() {
    if (dialog?.open) {
      dialog.close();
    }
    editingCode = null;
    showEditFeedback('');
  }
  async function saveEdit(event) {
    event.preventDefault();
    if (!editingCode) return;
    const book = books.find(
      item => item.code === editingCode
    );
    if (!book) {
      showEditFeedback(
        'Data buku tidak ditemukan.'
      );
      return;
    }
    const code = editCode.value
      .trim()
      .toUpperCase();
    const title = editTitle.value.trim();
    const category = editCategory.value;
    const stockText = editStock.value.trim();
    const stock = Number(stockText);
    if (
      !code ||
      !title ||
      !category ||
      stockText === ''
    ) {
      showEditFeedback(
        'Lengkapi seluruh kolom.'
      );
      return;
    }
    if (!/^[A-Z0-9_-]{2,50}$/.test(code)) {
      showEditFeedback(
        'Kode buku hanya boleh berisi huruf, angka, - atau _.'
      );
      return;
    }
    if (
      !Number.isSafeInteger(stock) ||
      stock < 0
    ) {
      showEditFeedback(
        'Stok harus berupa bilangan bulat nol atau lebih.'
      );
      return;
    }
    const button = $(
      '.db-dialog__save',
      editForm
    );
    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Menyimpan...';
      }
      const result = await api().post(
        'pustakawan/edit-buku.php',
        {
          book_id: book.databaseId,
          old_book_code: editingCode,
          id_buku: code,
          judul: title,
          kategori: category,
          stok: stock
        }
      );
      closeEdit();
      await loadBooks();
      showFeedback(
        result.message ||
        'Data buku berhasil diperbarui.'
      );
    } catch (error) {
      console.error(
        'Gagal mengedit buku:',
        error
      );
      showEditFeedback(
        error.message ||
        'Perubahan buku gagal disimpan.'
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent =
          'Simpan Perubahan';
      }
    }
  }
  async function deleteBook(code) {
    const book = books.find(
      item => item.code === code
    );
    if (!book) return;
    const confirmed = await window.EPerpus.confirm(
      `Apakah Anda yakin ingin menghapus buku "${book.title}" dari inventaris?\n\nBuku akan dinonaktifkan dan tidak lagi muncul dalam daftar koleksi aktif.`,
      {
        title: 'Hapus Buku?',
        confirmText: 'Ya, Hapus',
        cancelText: 'Batal',
        danger: true
      }
    );
    if (!confirmed) return;
    try {
      const result = await api().post(
        'pustakawan/hapus-buku.php',
        {
          book_id: book.databaseId,
          book_code: code
        }
      );
      await loadBooks();
      showFeedback(
        result.message ||
        'Buku berhasil dinonaktifkan.'
      );
    } catch (error) {
      console.error(
        'Gagal menghapus buku:',
        error
      );
      showFeedback(
        error.message ||
        'Buku gagal dihapus.',
        'error'
      );
    }
  }
  function initialize() {
    if (!tableBody) {
      console.error(
        'Elemen #bookTableBody tidak ditemukan.'
      );
      return;
    }
    showLoading();
    searchForm?.addEventListener(
      'submit',
      event => {
        event.preventDefault();
        renderTable();
      }
    );
    searchInput?.addEventListener(
      'input',
      renderTable
    );
    tableBody.addEventListener(
      'click',
      event => {
        const target =
          event.target instanceof Element
            ? event.target
            : null;
        if (!target) return;
        const edit = target.closest(
          '[data-edit-book]'
        );
        if (edit) {
          openEdit(
            edit.dataset.editBook
          );
          return;
        }
        const remove = target.closest(
          '[data-delete-book]'
        );
        if (remove) {
          deleteBook(
            remove.dataset.deleteBook
          );
        }
      }
    );
    editForm?.addEventListener(
      'submit',
      saveEdit
    );
    $('#closeEditDialog')?.addEventListener(
      'click',
      closeEdit
    );
    $('#cancelEditDialog')?.addEventListener(
      'click',
      closeEdit
    );
    dialog?.addEventListener(
      'click',
      event => {
        if (event.target === dialog) {
          closeEdit();
        }
      }
    );
    loadBooks().catch(showLoadError);
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
