(() => {
  'use strict';
  const API_ENDPOINT = 'pustakawan/transaksi.php';
  const PAGE_LIMIT = 100;
  const $ = (selector, root = document) =>
    root.querySelector(selector);
  const tableBody = $('#transactionTableBody');
  const searchForm = $('#transactionSearchForm');
  const searchInput = $('#keyword');
  const searchButton = $('[data-action="search-transactions"]');
  let transactions = [];
  let currentKeyword = '';
  let isLoading = false;
  function notify(message, type = 'info') {
    if (typeof window.EPerpus?.notify === 'function') {
      window.EPerpus.notify(message, type);
    } else {
      console.warn(
        'E-Perpustakaan: sistem notifikasi belum tersedia:',
        message
      );
    }
  }
  function normalizeTransaction(record) {
    const status = String(
      record.status || 'borrowed'
    )
      .trim()
      .toLowerCase();
    const displayStatus = String(
      record.display_status ||
      record.displayStatus ||
      status
    )
      .trim()
      .toLowerCase();
    return {
      id: Number(record.id) || null,
      displayId: String(
        record.displayId ||
        record.loan_code ||
        record.id ||
        '-'
      ),
      memberName: String(
        record.anggota ||
        record.full_name ||
        record.member_name ||
        'Anggota'
      ).trim(),
      npm: String(
        record.npm || ''
      ).trim(),
      program: String(
        record.prodi ||
        record.study_program ||
        '-'
      ).trim(),
      bookTitle: String(
        record.judul ||
        record.title ||
        'Buku tidak diketahui'
      ).trim(),
      bookCode: String(
        record.book_code || ''
      ).trim(),
      loanDate: String(
        record.tanggal ||
        record.loan_date ||
        ''
      ).trim(),
      dueDate: String(
        record.due_date || ''
      ).trim(),
      returnedAt: String(
        record.returned_at || ''
      ).trim(),
      status,
      displayStatus,
      isReturned:
        status === 'returned' ||
        displayStatus === 'returned',
      isOverdue:
        displayStatus === 'overdue'
    };
  }
  function showTableMessage(message, type = 'empty') {
    if (!tableBody) return;
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'transaction-empty';
    cell.textContent = message;
    cell.setAttribute('role', 'status');
    if (type === 'error') {
      cell.style.color = '#b42318';
    }
    row.appendChild(cell);
    tableBody.replaceChildren(row);
  }
  async function fetchAllTransactions(keyword = '') {
    if (!window.EPerpus?.api?.get) {
      throw new Error(
        'Modul API belum tersedia. Pastikan shared/app.js dimuat sebelum transaksi.js.'
      );
    }
    const allTransactions = [];
    let page = 1;
    let totalPages = 1;
    do {
      const response = await window.EPerpus.api.get(
        API_ENDPOINT,
        {
          keyword: keyword,
          page: page,
          limit: PAGE_LIMIT
        }
      );
      if (!Array.isArray(response.data)) {
        throw new Error(
          'Format data transaksi dari server tidak sesuai.'
        );
      }
      allTransactions.push(
        ...response.data.map(normalizeTransaction)
      );
      totalPages = Math.max(
        1,
        Number(response.pagination?.total_pages) || 1
      );
      page++;
    } while (page <= totalPages);
    return allTransactions;
  }
  function formatDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    const match = raw.match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
    return raw;
  }
  function createIdBadge(id) {
    const badge = document.createElement('span');
    badge.className = 'transaction-id';
    badge.textContent = id || '-';
    return badge;
  }
  function createProgramBadge(program) {
    const badge = document.createElement('span');
    badge.className = 'transaction-program';
    badge.textContent = program || '-';
    return badge;
  }
  function createStatusButton(record) {
    const button = document.createElement('button');
    const returned = record.isReturned;
    button.type = 'button';
    button.className = returned
      ? 'transaction-status transaction-status--returned'
      : 'transaction-status transaction-status--borrowed';
    const dot = document.createElement('span');
    dot.className = 'transaction-status__dot';
    dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = returned
      ? 'Dikembalikan'
      : record.isOverdue
        ? 'Terlambat'
        : 'Dipinjam';
    button.append(dot, label);
    if (returned) {
      button.disabled = true;
      button.title = 'Buku sudah dikembalikan';
      button.setAttribute(
        'aria-label',
        'Buku sudah dikembalikan'
      );
    } else {
      button.dataset.action = 'return-transaction';
      button.dataset.transactionId =
        String(record.id || '');
      button.title =
        'Klik untuk mencatat pengembalian buku';
      button.setAttribute(
        'aria-label',
        `Catat pengembalian buku ${record.bookTitle} oleh ${record.memberName}`
      );
    }
    return button;
  }
  function createTransactionRow(record) {
    const row = document.createElement('tr');
    row.dataset.transactionRow =
      String(record.id || '');
    const idCell = document.createElement('td');
    idCell.appendChild(
      createIdBadge(record.displayId)
    );
    const memberCell = document.createElement('td');
    const memberName = document.createElement('strong');
    memberName.className =
      'transaction-member-name';
    memberName.textContent =
      record.memberName;
    memberCell.appendChild(memberName);
    const programCell = document.createElement('td');
    programCell.appendChild(
      createProgramBadge(record.program)
    );
    const bookCell = document.createElement('td');
    const bookTitle = document.createElement('span');
    bookTitle.className =
      'transaction-book-title';
    bookTitle.textContent =
      record.bookTitle;
    bookCell.appendChild(bookTitle);
    const dateCell = document.createElement('td');
    const date = document.createElement('time');
    date.className = 'transaction-date';
    date.dateTime = record.loanDate;
    date.textContent =
      formatDate(record.loanDate);
    dateCell.appendChild(date);
    const statusCell = document.createElement('td');
    statusCell.appendChild(
      createStatusButton(record)
    );
    row.append(
      idCell,
      memberCell,
      programCell,
      bookCell,
      dateCell,
      statusCell
    );
    return row;
  }
  function renderTransactions() {
    if (!tableBody) return;
    if (transactions.length === 0) {
      showTableMessage(
        currentKeyword
          ? 'Transaksi yang dicari tidak ditemukan.'
          : 'Belum ada transaksi peminjaman.'
      );
      return;
    }
    const fragment =
      document.createDocumentFragment();
    transactions.forEach(record => {
      fragment.appendChild(
        createTransactionRow(record)
      );
    });
    tableBody.replaceChildren(fragment);
  }
  async function loadTransactions(keyword = currentKeyword) {
    if (isLoading) return;
    isLoading = true;
    currentKeyword = String(
      keyword || ''
    ).trim();
    showTableMessage(
      'Memuat data transaksi...'
    );
    if (searchButton) {
      searchButton.disabled = true;
    }
    try {
      transactions = await fetchAllTransactions(
        currentKeyword
      );
      renderTransactions();
      console.info(
        `E-Perpustakaan: ${transactions.length} transaksi berhasil dimuat dari database.`
      );
    } catch (error) {
      console.error(
        'Gagal memuat transaksi:',
        error
      );
      showTableMessage(
        `Gagal memuat transaksi. ${error.message}`,
        'error'
      );
      notify(
        error.message ||
        'Data transaksi gagal dimuat.',
        'error'
      );
    } finally {
      isLoading = false;
      if (searchButton) {
        searchButton.disabled = false;
      }
    }
  }
  async function returnTransaction(transactionId, button) {
    const record = transactions.find(item =>
      String(item.id) === String(transactionId)
    );
    if (!record) {
      notify(
        'Data transaksi tidak ditemukan.',
        'error'
      );
      return;
    }
    if (record.isReturned) {
      notify(
        'Buku ini sudah tercatat dikembalikan.',
        'info'
      );
      return;
    }
    const confirmed = await window.EPerpus.confirm(
      `Konfirmasi pengembalian buku "${record.bookTitle}" oleh ${record.memberName}?\n\nSetelah dikonfirmasi, status transaksi berubah menjadi Dikembalikan dan stok buku bertambah otomatis.`,
      {
        title: 'Konfirmasi Pengembalian',
        confirmText: 'Ya, Kembalikan',
        cancelText: 'Batal',
        danger: false
      }
    );
    if (!confirmed) return;
    button.disabled = true;
    const label = button.querySelector(
      'span:last-child'
    );
    if (label) {
      label.textContent = 'Memproses...';
    }
    try {
      const response = await window.EPerpus.api.post(
        API_ENDPOINT,
        {
          action: 'return',
          transaction_id: record.id
        }
      );
      notify(
        response.message ||
        'Pengembalian berhasil dicatat.',
        'success'
      );
      await loadTransactions(currentKeyword);
    } catch (error) {
      console.error(
        'Gagal mencatat pengembalian:',
        error
      );
      notify(
        error.message ||
        'Pengembalian gagal diproses.',
        'error'
      );
      button.disabled = false;
      if (label) {
        label.textContent = record.isOverdue
          ? 'Terlambat'
          : 'Dipinjam';
      }
    }
  }
  function handleSearch(event) {
    event.preventDefault();
    loadTransactions(
      searchInput?.value || ''
    );
  }
  function handleTableClick(event) {
    const target = event.target instanceof Element
      ? event.target
      : null;
    if (!target) return;
    const button = target.closest(
      '[data-action="return-transaction"]'
    );
    if (!button || button.disabled) return;
    returnTransaction(
      button.dataset.transactionId,
      button
    );
  }
  function initialize() {
    if (!tableBody) return;
    if (!window.EPerpus?.api) {
      showTableMessage(
        'Modul API belum dimuat. Periksa urutan script app.js dan transaksi.js.',
        'error'
      );
      return;
    }
    searchForm?.addEventListener(
      'submit',
      handleSearch
    );
    tableBody.addEventListener(
      'click',
      handleTableClick
    );
    searchInput?.addEventListener(
      'search',
      () => {
        if (!searchInput.value.trim()) {
          loadTransactions('');
        }
      }
    );
    window.addEventListener(
      'pageshow',
      event => {
        if (event.persisted) {
          loadTransactions(currentKeyword);
        }
      }
    );
    loadTransactions('');
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
