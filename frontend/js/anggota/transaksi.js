(() => {
  'use strict';
  const $ = (selector, root = document) =>
    root.querySelector(selector);
  const API_ENDPOINT = 'anggota/peminjaman.php';
  let statusVerified = false;
  let statusRequestId = 0;
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
  function notify(message, type = 'info') {
    if (window.EPerpus?.notify) {
      window.EPerpus.notify(message, type);
    } else {
      console.warn(
        'E-Perpustakaan: sistem notifikasi belum tersedia:',
        message
      );
    }
  }
  function getCurrentBook() {
    const button = $('[data-action="borrow"]');
    if (!button) return null;
    return {
      id: Number(button.dataset.bookId || 0),
      code: button.dataset.bookCode || '',
      title: button.dataset.bookTitle || ''
    };
  }
  function getStock() {
    const element = $('[data-book-stock]');
    if (!element) return null;
    const value = Number(
      element.textContent.trim()
    );
    return Number.isFinite(value) ? value : null;
  }
  function updateStock(stock) {
    const value = Number(stock);
    if (!Number.isFinite(value) || value < 0) {
      return;
    }
    const safeStock = Math.max(0, value);
    const element = $('[data-book-stock]');
    const button = $('[data-action="borrow"]');
    if (element) {
      element.textContent = String(safeStock);
    }
    if (button) {
      button.dataset.bookStock = String(safeStock);
    }
  }
  function updateBorrowCount() {
    const element = $('[data-book-borrow-count]');
    if (!element) return;
    const current = Number(
      element.dataset.count || 0
    );
    const safeCurrent =
      Number.isFinite(current) && current >= 0
        ? current
        : 0;
    const next = safeCurrent + 1;
    element.dataset.count = String(next);
    element.textContent = `Dipinjam ${next}x`;
  }
  async function initializeBorrowState() {
    const button = $('[data-action="borrow"]');
    if (!button) return;
    const book = getCurrentBook();
    if (!book || !Number.isInteger(book.id) || book.id < 1) {
      statusVerified = false;
      button.disabled = true;
      setButtonLabel(button, 'Memuat data buku...');
      return;
    }
    const requestId = ++statusRequestId;
    statusVerified = false;
    button.disabled = true;
    setButtonLabel(
      button,
      'Memeriksa status...'
    );
    try {
      if (!window.EPerpus?.api?.get) {
        throw new Error('Koneksi API belum tersedia.');
      }
      const result = await window.EPerpus.api.get(
        API_ENDPOINT,
        {
          book_id: book.id
        }
      );
      if (requestId !== statusRequestId) return;
      if (!result?.success || !result.data) {
        throw new Error(
          result?.message ||
          'Status peminjaman gagal diperiksa.'
        );
      }
      const data = result.data;
      const stock = getStock();
      statusVerified = true;
      button.removeAttribute('title');
      if (data.has_active_loan === true) {
        button.dataset.borrowed = 'true';
        button.disabled = true;
        button.title =
          'Menunggu pustakawan mencatat pengembalian.';
        setButtonLabel(
          button,
          'Berhasil dipinjam'
        );
        return;
      }
      button.dataset.borrowed = 'false';
      if (stock !== null && stock <= 0) {
        button.disabled = true;
        setButtonLabel(
          button,
          'Stok Buku Habis'
        );
        return;
      }
      if (data.latest_loan?.status === 'returned') {
        button.disabled = false;
        setButtonLabel(
          button,
          'Pinjam Lagi'
        );
        return;
      }
      button.disabled = false;
      setButtonLabel(
        button,
        'Pinjam Buku'
      );
    } catch (error) {
      if (requestId !== statusRequestId) return;
      console.error(
        'Gagal memeriksa status peminjaman:',
        error
      );
      statusVerified = false;
      button.disabled = false;
      button.dataset.statusError = 'true';
      button.title =
        'Klik untuk mencoba memeriksa status kembali.';
      setButtonLabel(
        button,
        'Coba Lagi'
      );
    }
  }
  async function borrowBook(button) {
    if (!button) return;
    if (button.dataset.processing === 'true') {
      return;
    }
    if (!statusVerified) {
      await initializeBorrowState();
      return;
    }
    if (button.dataset.borrowed === 'true') {
      notify(
        'Buku masih Anda pinjam. Tunggu pengembalian dicatat pustakawan.',
        'info'
      );
      return;
    }
    const book = getCurrentBook();
    if (!book || !Number.isInteger(book.id) || book.id < 1) {
      notify(
        'ID buku tidak ditemukan.',
        'error'
      );
      return;
    }
    const stock = getStock();
    if (stock !== null && stock <= 0) {
      button.disabled = true;
      setButtonLabel(
        button,
        'Stok Buku Habis'
      );
      notify(
        'Stok buku sedang habis.',
        'warning'
      );
      return;
    }
    button.dataset.processing = 'true';
    button.disabled = true;
    setButtonLabel(
      button,
      'Memproses...'
    );
    try {
      if (!window.EPerpus?.api?.post) {
        throw new Error('Koneksi API belum tersedia.');
      }
      const result = await window.EPerpus.api.post(
        API_ENDPOINT,
        {
          book_id: book.id
        }
      );
      if (!result?.success || !result.data) {
        throw new Error(
          result?.message ||
          'Peminjaman gagal diproses.'
        );
      }
      const transaction = result.data;
      if (transaction.available_stock !== undefined) {
        updateStock(transaction.available_stock);
      }
      updateBorrowCount();
      statusVerified = true;
      button.dataset.borrowed = 'true';
      button.disabled = true;
      delete button.dataset.statusError;
      button.title =
        'Peminjaman sudah tercatat. Menunggu pengembalian pustakawan.';
      setButtonLabel(
        button,
        'Berhasil dipinjam'
      );
      notify(
        result.message || 'Berhasil dipinjam.',
        'success'
      );
      document.dispatchEvent(
        new CustomEvent('eperpus:loan-created', {
          detail: transaction
        })
      );
    } catch (error) {
      console.error(
        'Peminjaman gagal:',
        error
      );
      await initializeBorrowState();
      notify(
        error.message ||
        'Terjadi kesalahan saat meminjam buku.',
        'error'
      );
    } finally {
      delete button.dataset.processing;
    }
  }
  document.addEventListener('click', event => {
    const target = event.target instanceof Element
      ? event.target
      : null;
    const button = target?.closest(
      '[data-action="borrow"]'
    );
    if (!button) return;
    if (button.dataset.statusError === 'true') {
      delete button.dataset.statusError;
      initializeBorrowState();
      return;
    }
    if (button.disabled) return;
    borrowBook(button);
  });
  document.addEventListener(
    'eperpus:book-loaded',
    () => {
      initializeBorrowState();
    }
  );
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      initializeBorrowState();
    }
  });
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initializeBorrowState,
      { once: true }
    );
  } else {
    initializeBorrowState();
  }
})();
