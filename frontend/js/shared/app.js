// API dan session bersama; muat sebelum modul halaman.
(() => {
  'use strict';
  if (window.EPerpus?.api) {
    console.warn('E-Perpustakaan: shared/app.js sudah dimuat.');
    return;
  }
  const script =
    document.currentScript ||
    document.querySelector('script[src*="/js/shared/app.js"]');
  if (!script) {
    console.error(
      'E-Perpustakaan: shared/app.js tidak ditemukan.'
    );
    return;
  }
  const BACKEND_BASE_URL = new URL(
    '../../../backend/',
    script.src
  );
  let csrfToken = null;
  let backendAvailable = false;
  let currentUserCache = undefined;
  const $ = (selector, root = document) =>
    root.querySelector(selector);
  let activeConfirmationClose = null;
  function ensureFeedbackStyles() {
    if ($('#e-perpus-feedback-styles')) return;
    const style = document.createElement('style');
    style.id = 'e-perpus-feedback-styles';
    style.textContent = `
      .ep-toast-container {
        position: fixed;
        top: 22px;
        right: 22px;
        z-index: 12000;
        display: grid;
        gap: 12px;
        width: min(420px, calc(100vw - 32px));
        pointer-events: none;
      }
      .ep-toast {
        --ep-accent: #2563eb;
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr) 28px;
        align-items: start;
        gap: 12px;
        position: relative;
        overflow: hidden;
        padding: 15px 14px 17px;
        border: 1px solid #e7ebf3;
        border-left: 4px solid var(--ep-accent);
        border-radius: 16px;
        background: #fff;
        color: #17233d;
        box-shadow: 0 16px 42px rgba(15, 35, 75, .16);
        font-family: Inter, "Plus Jakarta Sans", system-ui, sans-serif;
        opacity: 0;
        transform: translate3d(0, -10px, 0);
        transition: opacity .22s ease, transform .22s ease;
        pointer-events: auto;
      }
      .ep-toast.is-visible {
        opacity: 1;
        transform: translate3d(0, 0, 0);
      }
      .ep-toast.is-leaving {
        opacity: 0;
        transform: translate3d(0, -8px, 0);
      }
      .ep-toast[data-type="success"] { --ep-accent: #15945b; }
      .ep-toast[data-type="error"] { --ep-accent: #dc3545; }
      .ep-toast[data-type="warning"] { --ep-accent: #d99012; }
      .ep-toast[data-type="info"] { --ep-accent: #2563eb; }
      .ep-toast__icon {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: 13px;
        background: color-mix(in srgb, var(--ep-accent) 12%, white);
        color: var(--ep-accent);
        font-size: 19px;
        font-weight: 800;
        line-height: 1;
      }
      .ep-toast__content { min-width: 0; padding-top: 1px; }
      .ep-toast__title {
        margin: 0 0 3px;
        color: #14213d;
        font-size: 14px;
        font-weight: 800;
        line-height: 1.35;
      }
      .ep-toast__message {
        margin: 0;
        color: #64718a;
        font-size: 13px;
        line-height: 1.55;
        overflow-wrap: anywhere;
      }
      .ep-toast__close {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: #8792a7;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
      }
      .ep-toast__close:hover {
        background: #f1f4f9;
        color: #263550;
      }
      .ep-toast__progress {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        height: 3px;
        background: color-mix(in srgb, var(--ep-accent) 18%, white);
      }
      .ep-toast__progress::after {
        display: block;
        width: 100%;
        height: 100%;
        background: var(--ep-accent);
        content: "";
        transform-origin: left;
        animation: ep-toast-progress 4.8s linear forwards;
      }
      @keyframes ep-toast-progress {
        to { transform: scaleX(0); }
      }
      .ep-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 13000;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(8, 22, 49, .58);
        backdrop-filter: blur(5px);
        animation: ep-modal-fade .18s ease both;
      }
      .ep-confirm-dialog {
        width: min(100%, 450px);
        padding: 28px;
        border: 1px solid rgba(255,255,255,.72);
        border-radius: 22px;
        background: #fff;
        box-shadow: 0 26px 80px rgba(2, 14, 38, .28);
        font-family: Inter, "Plus Jakarta Sans", system-ui, sans-serif;
        animation: ep-modal-rise .22s ease both;
      }
      .ep-confirm-dialog__icon {
        display: grid;
        place-items: center;
        width: 54px;
        height: 54px;
        margin-bottom: 19px;
        border-radius: 17px;
        background: #fff4df;
        color: #c17a0a;
        font-size: 25px;
        font-weight: 800;
      }
      .ep-confirm-dialog[data-danger="true"] .ep-confirm-dialog__icon {
        background: #fff0f1;
        color: #dc3545;
      }
      .ep-confirm-dialog__title {
        margin: 0 0 9px;
        color: #14213d;
        font-size: 20px;
        font-weight: 800;
        letter-spacing: -.35px;
        line-height: 1.35;
      }
      .ep-confirm-dialog__message {
        margin: 0;
        color: #637089;
        font-size: 14px;
        line-height: 1.7;
        white-space: pre-line;
        overflow-wrap: anywhere;
      }
      .ep-confirm-dialog__actions {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 26px;
      }
      .ep-confirm-dialog__button {
        min-height: 43px;
        padding: 0 17px;
        border: 1px solid transparent;
        border-radius: 11px;
        font: inherit;
        font-size: 13px;
        font-weight: 750;
        cursor: pointer;
        transition: background .16s ease, transform .16s ease, box-shadow .16s ease;
      }
      .ep-confirm-dialog__button:focus-visible,
      .ep-toast__close:focus-visible {
        outline: 3px solid rgba(37, 99, 235, .28);
        outline-offset: 2px;
      }
      .ep-confirm-dialog__button:active { transform: translateY(1px); }
      .ep-confirm-dialog__button--cancel {
        border-color: #e1e6ef;
        background: #fff;
        color: #526078;
      }
      .ep-confirm-dialog__button--cancel:hover {
        background: #f6f8fb;
      }
      .ep-confirm-dialog__button--confirm {
        background: #12377d;
        color: #fff;
        box-shadow: 0 5px 13px rgba(18, 55, 125, .18);
      }
      .ep-confirm-dialog__button--confirm:hover {
        background: #0c2c69;
      }
      .ep-confirm-dialog[data-danger="true"] .ep-confirm-dialog__button--confirm {
        background: #dc3545;
        box-shadow: 0 5px 13px rgba(220, 53, 69, .18);
      }
      .ep-confirm-dialog[data-danger="true"] .ep-confirm-dialog__button--confirm:hover {
        background: #c52d3c;
      }
      @keyframes ep-modal-fade {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes ep-modal-rise {
        from { opacity: 0; transform: translateY(10px) scale(.985); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @media (max-width: 520px) {
        .ep-toast-container { top: 12px; right: 12px; width: calc(100vw - 24px); }
        .ep-confirm-dialog { padding: 23px 20px; border-radius: 19px; }
        .ep-confirm-dialog__actions { flex-direction: column-reverse; }
        .ep-confirm-dialog__button { width: 100%; }
      }
      @media (prefers-reduced-motion: reduce) {
        .ep-toast, .ep-modal-backdrop, .ep-confirm-dialog,
        .ep-toast__progress::after {
          animation: none !important;
          transition: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }
  function getToastContainer() {
    let container = $('[data-ep-toast-container]');
    if (!container) {
      container = document.createElement('div');
      container.className = 'ep-toast-container';
      container.dataset.epToastContainer = 'true';
      container.setAttribute('aria-label', 'Notifikasi aplikasi');
      document.body.appendChild(container);
    }
    return container;
  }
  function notify(message, type = 'info') {
    ensureFeedbackStyles();
    const normalizedType = [
      'success',
      'error',
      'warning',
      'info'
    ].includes(type)
      ? type
      : 'info';
    const titles = {
      success: 'Berhasil',
      error: 'Terjadi Kesalahan',
      warning: 'Perhatian',
      info: 'Informasi'
    };
    const symbols = {
      success: '✓',
      error: '×',
      warning: '!',
      info: 'i'
    };
    const container = getToastContainer();
    while (container.children.length >= 4) {
      const oldest = container.firstElementChild;
      if (oldest) oldest.remove();
    }
    const toast = document.createElement('section');
    toast.className = 'ep-toast';
    toast.dataset.type = normalizedType;
    toast.setAttribute(
      'role',
      normalizedType === 'error' ? 'alert' : 'status'
    );
    toast.setAttribute(
      'aria-live',
      normalizedType === 'error' ? 'assertive' : 'polite'
    );
    const icon = document.createElement('span');
    icon.className = 'ep-toast__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = symbols[normalizedType];
    const content = document.createElement('div');
    content.className = 'ep-toast__content';
    const title = document.createElement('p');
    title.className = 'ep-toast__title';
    title.textContent = titles[normalizedType];
    const description = document.createElement('p');
    description.className = 'ep-toast__message';
    description.textContent = String(message ?? '');
    content.append(title, description);
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'ep-toast__close';
    closeButton.setAttribute('aria-label', 'Tutup notifikasi');
    closeButton.textContent = '×';
    const progress = document.createElement('span');
    progress.className = 'ep-toast__progress';
    progress.setAttribute('aria-hidden', 'true');
    toast.append(icon, content, closeButton, progress);
    container.appendChild(toast);
    let removeTimer = null;
    const removeToast = () => {
      if (removeTimer) {
        window.clearTimeout(removeTimer);
      }
      toast.classList.add('is-leaving');
      window.setTimeout(() => {
        toast.remove();
        if (!container.children.length) {
          container.remove();
        }
      }, 230);
    };
    closeButton.addEventListener('click', removeToast);
    window.requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });
    removeTimer = window.setTimeout(removeToast, 4800);
  }
  function confirm(message, options = {}) {
    ensureFeedbackStyles();
    const config = message && typeof message === 'object'
      ? { ...message }
      : { ...options, message };
    const danger = config.danger === true;
    const titleText = config.title ||
      (danger ? 'Konfirmasi penghapusan' : 'Konfirmasi tindakan');
    const confirmText = config.confirmText ||
      (danger ? 'Ya, Hapus' : 'Ya, Lanjutkan');
    const cancelText = config.cancelText || 'Batal';
    if (activeConfirmationClose) {
      activeConfirmationClose(false);
    }
    return new Promise(resolve => {
      const previousFocus = document.activeElement;
      const previousOverflow = document.body.style.overflow;
      const backdrop = document.createElement('div');
      backdrop.className = 'ep-modal-backdrop';
      const dialog = document.createElement('section');
      dialog.className = 'ep-confirm-dialog';
      dialog.dataset.danger = danger ? 'true' : 'false';
      dialog.setAttribute('role', 'alertdialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'ep-confirm-title');
      dialog.setAttribute('aria-describedby', 'ep-confirm-message');
      dialog.setAttribute('tabindex', '-1');
      const icon = document.createElement('div');
      icon.className = 'ep-confirm-dialog__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = danger ? '!' : '?';
      const title = document.createElement('h2');
      title.className = 'ep-confirm-dialog__title';
      title.id = 'ep-confirm-title';
      title.textContent = titleText;
      const description = document.createElement('p');
      description.className = 'ep-confirm-dialog__message';
      description.id = 'ep-confirm-message';
      description.textContent = String(config.message ?? '');
      const actions = document.createElement('div');
      actions.className = 'ep-confirm-dialog__actions';
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className =
        'ep-confirm-dialog__button ep-confirm-dialog__button--cancel';
      cancelButton.textContent = cancelText;
      const confirmButton = document.createElement('button');
      confirmButton.type = 'button';
      confirmButton.className =
        'ep-confirm-dialog__button ep-confirm-dialog__button--confirm';
      confirmButton.textContent = confirmText;
      actions.append(cancelButton, confirmButton);
      dialog.append(icon, title, description, actions);
      backdrop.appendChild(dialog);
      let finished = false;
      const finish = result => {
        if (finished) return;
        finished = true;
        document.removeEventListener('keydown', handleKeydown);
        backdrop.remove();
        document.body.style.overflow = previousOverflow;
        if (activeConfirmationClose === finish) {
          activeConfirmationClose = null;
        }
        if (
          previousFocus instanceof HTMLElement &&
          previousFocus.isConnected
        ) {
          previousFocus.focus();
        }
        resolve(result);
      };
      const handleKeydown = event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
          return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [
          cancelButton,
          confirmButton
        ].filter(button => !button.disabled);
        if (event.shiftKey && document.activeElement === focusable[0]) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === focusable[focusable.length - 1]
        ) {
          event.preventDefault();
          focusable[0].focus();
        }
      };
      activeConfirmationClose = finish;
      cancelButton.addEventListener('click', () => finish(false));
      confirmButton.addEventListener('click', () => finish(true));
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop) {
          finish(false);
        }
      });
      document.addEventListener('keydown', handleKeydown);
      document.body.style.overflow = 'hidden';
      document.body.appendChild(backdrop);
      window.requestAnimationFrame(() => {
        cancelButton.focus();
      });
    });
  }
function buildUrl(endpoint, params = null) {
  const url = new URL(
    String(endpoint || '').replace(/^\/+/, ''),
    BACKEND_BASE_URL
  );
  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        value !== ''
      ) {
        url.searchParams.set(key, String(value));
      }
    });
  }
  return url;
}
async function parseResponse(response) {
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch (error) {
    const detail = raw
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 250);
    const message = detail
      ? `PHP tidak mengembalikan JSON. HTTP ${response.status}. Detail: ${detail}`
      : `PHP mengembalikan respons kosong. HTTP ${response.status}.`;
    const exception = new Error(message);
    exception.status = response.status;
    throw exception;
  }
  if (payload.csrf_token) {
    csrfToken = payload.csrf_token;
  }
  if (!response.ok || payload.success === false) {
    const exception = new Error(
      payload.message ||
      `Permintaan gagal. HTTP ${response.status}.`
    );
    exception.status = response.status;
    exception.payload = payload;
    throw exception;
  }
  return payload;
}
async function getCsrfToken() {
  if (csrfToken) {
    return csrfToken;
  }
  const response = await fetch(
    buildUrl('shared/csrf.php'),
    {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json'
      }
    }
  );
  const payload = await parseResponse(response);
  csrfToken = payload.csrf_token || null;
  if (!csrfToken) {
    throw new Error(
      'Token keamanan tidak berhasil diperoleh.'
    );
  }
  backendAvailable = true;
  return csrfToken;
}
async function apiGet(endpoint, params = null) {
  const response = await fetch(
    buildUrl(endpoint, params),
    {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json'
      }
    }
  );
  const result = await parseResponse(response);
  backendAvailable = true;
  return result;
}
async function apiPost(endpoint, payload = {}) {
  const token = await getCsrfToken();
  const response = await fetch(
    buildUrl(endpoint),
    {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': token
      },
      body: JSON.stringify(payload ?? {})
    }
  );
  const result = await parseResponse(response);
  backendAvailable = true;
  return result;
}
async function apiUpload(endpoint, formData) {
  if (!(formData instanceof FormData)) {
    throw new Error(
      'Data upload harus menggunakan FormData.'
    );
  }
  const token = await getCsrfToken();
  const response = await fetch(
    buildUrl(endpoint),
    {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'X-CSRF-Token': token
      },
      body: formData
    }
  );
  const result = await parseResponse(response);
  backendAvailable = true;
  return result;
}
async function getCurrentUser(force = false) {
  if (
    !force &&
    currentUserCache !== undefined
  ) {
    return currentUserCache;
  }
  try {
    const result = await apiGet(
      'auth/current-user.php'
    );
    currentUserCache = result.authenticated
      ? result.user
      : null;
    if (result.csrf_token) {
      csrfToken = result.csrf_token;
    }
    return currentUserCache;
  } catch (error) {
    if (error.status === 401) {
      currentUserCache = null;
      return null;
    }
    throw error;
  }
}
function setCurrentUser(user) {
  currentUserCache = user || null;
}
async function logout() {
  const user = await getCurrentUser();
  if (!user) {
    currentUserCache = null;
    csrfToken = null;
    return true;
  }
  const endpointByRole = {
    anggota: 'auth/anggota-logout.php',
    pustakawan: 'auth/pustakawan-logout.php',
    kepus: 'auth/kepus-logout.php'
  };
  const endpoint = endpointByRole[user.role];
  if (!endpoint) {
    throw new Error(
      'Role sesi tidak dikenali.'
    );
  }
  await apiPost(endpoint, {});
  currentUserCache = null;
  csrfToken = null;
  return true;
}
async function navigate(route) {
  const target = String(route || '').trim();
  if (
    !target ||
    /^(https?:|javascript:|data:)/i.test(target)
  ) {
    notify(
      'Tujuan navigasi tidak valid.',
      'error'
    );
    return;
  }
  if (
    /auth\/login\/(anggota|pustakawan|kepus)\.html$/i
      .test(target)
  ) {
    try {
      await logout();
    } catch (error) {
      console.error('Logout gagal:', error);
      notify(
        error.message || 'Logout gagal. Coba kembali.',
        'error'
      );
      return;
    }
  }
  window.location.href = target;
}
async function protectPage() {
  const path = window.location.pathname.toLowerCase();
  const protectedRole =
    path.includes('/frontend/html/anggota/')
      ? 'anggota'
      : path.includes('/frontend/html/pustakawan/')
        ? 'pustakawan'
        : path.includes('/frontend/html/kepus/')
          ? 'kepus'
          : null;
  if (!protectedRole) {
    return;
  }
  try {
    const user = await getCurrentUser(true);
    if (
      !user ||
      user.role !== protectedRole
    ) {
      const projectRoot = new URL(
        '../../../',
        window.location.href
      );
      const loginUrl = new URL(
        `frontend/html/auth/login/${protectedRole}.html`,
        projectRoot
      );
      window.location.replace(loginUrl.href);
      return;
    }
    document.dispatchEvent(
      new CustomEvent(
        'eperpus:session-ready',
        {
          detail: user
        }
      )
    );
  } catch (error) {
    console.error(
      'Pemeriksaan sesi gagal:',
      error
    );
    notify(
      'Sesi belum dapat diverifikasi. Pastikan endpoint current-user.php tersedia.',
      'error'
    );
  }
}
async function checkBackend() {
  try {
    await getCsrfToken();
    backendAvailable = true;
    console.info(
      'E-Perpustakaan: Endpoint PHP dan CSRF berhasil diakses.'
    );
    return true;
  } catch (error) {
    backendAvailable = false;
    console.warn(
      'Backend E-Perpustakaan belum dapat diakses:',
      error.message
    );
    return false;
  }
}
const api = Object.freeze({
  get: apiGet,
  post: apiPost,
  upload: apiUpload,
  url: buildUrl
});
const disabledStore = Object.freeze({
  getItem() {
    return null;
  },
  setItem() {
    throw new Error(
      'Penyimpanan browser dinonaktifkan. Gunakan backend PHP-MySQL.'
    );
  },
  removeItem() {
    return null;
  },
  clear() {
    return null;
  }
});
window.EPerpus = Object.freeze({
  api,
  notify,
  confirm,
  navigate,
  getCurrentUser,
  setCurrentUser,
  logout,
  checkBackend,
  storage: disabledStore,
  read() {
    return null;
  },
  write() {
    throw new Error(
      'Data harus disimpan melalui API PHP-MySQL.'
    );
  },
  remove() {
    return false;
  },
  clearSessions: logout,
  get backendReady() {
    return backendAvailable;
  },
  get backendBaseUrl() {
    return BACKEND_BASE_URL.href;
  }
});
document.addEventListener('click', event => {
  const target =
    event.target instanceof Element
      ? event.target.closest('[data-route]')
      : null;
  if (!target) {
    return;
  }
  const route =
    target.dataset.route ||
    target.getAttribute('href');
  if (!route) {
    return;
  }
  event.preventDefault();
  navigate(route);
});
document.addEventListener('keydown', event => {
  const interactive =
    event.target instanceof Element
      ? event.target.closest(
          '[role="link"], [role="button"]'
        )
      : null;
  if (
    !interactive ||
    interactive.tagName === 'BUTTON'
  ) {
    return;
  }
  if (
    event.key === 'Enter' ||
    event.key === ' '
  ) {
    event.preventDefault();
    interactive.click();
  }
});
checkBackend();
if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    protectPage,
    { once: true }
  );
} else {
  protectPage();
}
})();
