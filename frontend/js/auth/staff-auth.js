(() => {
  'use strict';
  const $ = (selector, root = document) =>
    root.querySelector(selector);
  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];
  const CONFIG = {
    pustakawan: {
      label: 'Pustakawan',
      login: 'auth/pustakawan-login.php',
      home: '../../pustakawan/beranda.html'
    },
    kepus: {
      label: 'Kepala Perpustakaan',
      login: 'auth/kepus-login.php',
      home: '../../kepus/laporan.html'
    }
  };
  const STAFF_ROLES = ['pustakawan', 'kepus'];
  function showFeedback(form, message, type = 'info') {
    const element = $('[data-auth-feedback]', form);
    if (!element) return;
    element.textContent = message;
    element.className =
      `auth-feedback auth-feedback--${type}`;
    element.hidden = false;
  }
  function clearFeedback(form) {
    const element = $('[data-auth-feedback]', form);
    if (!element) return;
    element.textContent = '';
    element.hidden = true;
  }
  function setFieldError(form, field, message) {
    const error = $$('[data-error-for]', form)
      .find(item => item.dataset.errorFor === field.name);
    if (message) {
      field.setAttribute('aria-invalid', 'true');
      field.classList.add('form__input--error');
    } else {
      field.removeAttribute('aria-invalid');
      field.classList.remove('form__input--error');
    }
    if (error) {
      error.textContent = message;
      error.hidden = !message;
    }
  }
  function togglePassword(button) {
    const field = document.getElementById(
      button.dataset.togglePassword
    );
    if (!field) return;
    const visible = field.type === 'password';
    field.type = visible ? 'text' : 'password';
    button.setAttribute(
      'aria-pressed',
      String(visible)
    );
    button.setAttribute(
      'aria-label',
      visible
        ? 'Sembunyikan password'
        : 'Tampilkan password'
    );
  }
  function validate(form) {
    let valid = true;
    let first = null;
    const formType = form.dataset.authForm;
    $$('input[name]', form).forEach(field => {
      const value = field.type === 'password'
        ? field.value
        : field.value.trim();
      let error = '';
      if (field.required && !value) {
        error = 'Bagian ini wajib diisi.';
      } else if (
        field.name === 'npm' &&
        value &&
        !/^[A-Z0-9][A-Z0-9._-]{2,39}$/i.test(value)
      ) {
        error = 'NIP/kode identitas tidak valid.';
      } else if (
        field.name === 'nama' &&
        value.length > 0 &&
        value.length < 3
      ) {
        error = 'Nama minimal 3 karakter.';
      } else if (
        field.name === 'password' &&
        formType === 'register' &&
        value.length < 8
      ) {
        error = 'Password minimal 8 karakter.';
      } else if (
        [
          'konfirmasi_password',
          'password-confirm',
          'passwordConfirm'
        ].includes(field.name) &&
        formType === 'register' &&
        value !== (
          form.elements.namedItem('password')?.value || ''
        )
      ) {
        error = 'Konfirmasi password tidak sama.';
      } else if (
        field.name === 'email' &&
        value &&
        field.type === 'email' &&
        field.validity.typeMismatch
      ) {
        error = 'Format email tidak valid.';
      }
      setFieldError(form, field, error);
      if (error) {
        valid = false;
        first ||= field;
      }
    });
    first?.focus();
    return valid;
  }
  async function handleLogin(form) {
    const role = form.dataset.userRole;
    const config = CONFIG[role];
    if (!config) {
      throw new Error('Jenis akun tidak dikenal.');
    }
    const result = await window.EPerpus.api.post(
      config.login,
      {
        nip:
          form.elements.namedItem('npm')?.value.trim() || '',
        password:
          form.elements.namedItem('password')?.value || ''
      }
    );
    window.EPerpus.setCurrentUser(result.user);
    showFeedback(
      form,
      result.message || 'Login berhasil.',
      'success'
    );
    window.setTimeout(() => {
      window.location.href = config.home;
    }, 650);
  }
  async function handleRegistration(form) {
    const role = form.dataset.userRole;
    if (!STAFF_ROLES.includes(role)) {
      throw new Error('Jenis akun tidak valid.');
    }
    const quota = await getStaffQuota(role);
    if (!quota.registration_open) {
      form.dataset.registrationFull = 'true';
      throw new Error(
        role === 'kepus'
          ? 'Akun Kepala Perpustakaan sudah terdaftar. Pendaftaran ditutup.'
          : 'Dua akun Pustakawan sudah terdaftar. Pendaftaran ditutup.'
      );
    }
    const result = await window.EPerpus.api.post(
      'auth/staff-registrasi.php',
      {
        role: role,
        nama:
          form.elements.namedItem('nama')?.value.trim() || '',
        npm:
          form.elements.namedItem('npm')?.value.trim() || '',
        password:
          form.elements.namedItem('password')?.value || '',
        konfirmasi_password:
          form.elements.namedItem('konfirmasi_password')?.value || ''
      }
    );
    showFeedback(
      form,
      result.message || 'Pendaftaran berhasil.',
      'success'
    );
    form.reset();
    await refreshStaffQuota(form);
  }
  async function getStaffQuota(role) {
    if (!STAFF_ROLES.includes(role)) {
      throw new Error('Jenis akun tidak valid.');
    }
    const result = await window.EPerpus.api.get(
      'auth/staff-registrasi.php',
      {
        role: role
      }
    );
    if (!result.success || !result.quota) {
      throw new Error(
        result.message || 'Informasi kuota tidak tersedia.'
      );
    }
    return result.quota;
  }
  async function refreshStaffQuota(form) {
    const role = form.dataset.userRole;
    if (!STAFF_ROLES.includes(role)) {
      return;
    }
    const submit = $('button[type="submit"]', form);
    let notice = $('[data-registration-quota]', form);
    if (!notice) {
      notice = document.createElement('p');
      notice.dataset.registrationQuota = 'true';
      notice.className =
        'auth-feedback register-feedback';
      notice.setAttribute('role', 'status');
      notice.setAttribute(
        'aria-live',
        'polite'
      );
      if (submit) {
        form.insertBefore(notice, submit);
      } else {
        form.appendChild(notice);
      }
    }
    try {
      const quota = await getStaffQuota(role);
      const registered = Number(quota.registered);
      const maximum = Number(quota.maximum);
      const remaining = Number(quota.remaining);
      if (
        remaining <= 0 ||
        quota.registration_open === false
      ) {
        notice.textContent =
          role === 'kepus'
            ? 'Akun Kepala Perpustakaan sudah terdaftar. Pendaftaran telah ditutup.'
            : 'Dua akun Pustakawan sudah terdaftar. Pendaftaran telah ditutup.';
        notice.className =
          'auth-feedback auth-feedback--error register-feedback';
        form.dataset.registrationFull = 'true';
        if (submit) {
          submit.disabled = true;
          submit.textContent = 'Pendaftaran Ditutup';
        }
      } else {
        notice.textContent =
          `Sudah terdaftar ${registered} dari ${maximum} akun. ` +
          `Sisa pendaftaran: ${remaining} akun.`;
        notice.className =
          'auth-feedback register-feedback';
        form.dataset.registrationFull = 'false';
        if (submit) {
          submit.disabled = false;
          submit.textContent = 'Daftar';
        }
      }
      notice.hidden = false;
    } catch (error) {
      console.error(
        'Gagal memeriksa kuota pendaftaran:',
        error
      );
      notice.textContent =
        'Kuota belum dapat diperiksa. Silakan muat ulang halaman.';
      notice.className =
        'auth-feedback auth-feedback--error register-feedback';
      notice.hidden = false;
      form.dataset.registrationFull = 'true';
      if (submit) {
        submit.disabled = true;
        submit.textContent = 'Coba Muat Ulang';
      }
    }
  }
  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    clearFeedback(form);
    if (!validate(form)) {
      showFeedback(
        form,
        'Periksa kembali data yang Anda masukkan.',
        'error'
      );
      return;
    }
    const submit = $('button[type="submit"]', form);
    const original = submit?.textContent;
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Memproses...';
    }
    try {
      if (form.dataset.authForm === 'login') {
        await handleLogin(form);
      } else if (form.dataset.authForm === 'register') {
        await handleRegistration(form);
      }
    } catch (error) {
      console.error(
        'Autentikasi staf gagal:',
        error
      );
      showFeedback(
        form,
        error.message || 'Permintaan gagal diproses.',
        'error'
      );
      if (form.dataset.authForm === 'register') {
        await refreshStaffQuota(form);
      }
    } finally {
      if (submit && document.contains(submit)) {
        if (
          form.dataset.authForm === 'register' &&
          form.dataset.registrationFull === 'true'
        ) {
          submit.disabled = true;
          submit.textContent = 'Pendaftaran Ditutup';
        } else {
          submit.disabled = false;
          submit.textContent = original;
        }
      }
    }
  }
  function initialize() {
    $$(
      'form[data-auth-form]'
    ).forEach(form => {
      form.addEventListener(
        'submit',
        handleSubmit
      );
      form.addEventListener('input', () => {
        clearFeedback(form);
      });
      if (form.dataset.authForm === 'register') {
        refreshStaffQuota(form);
      }
    });
    document.addEventListener('click', event => {
      const button = event.target instanceof Element
        ? event.target.closest('[data-toggle-password]')
        : null;
      if (button) {
        togglePassword(button);
      }
    });
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
