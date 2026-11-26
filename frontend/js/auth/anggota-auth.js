(() => {
  'use strict';
  const $ = (selector, root = document) =>
    root.querySelector(selector);
  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];
  const NPM_PATTERN = /^\d{8,20}$/;
  function showFeedback(form, message, type = 'info') {
    const element = $('[data-auth-feedback]', form);
    if (!element) return;
    element.textContent = message;
    element.className = `auth-feedback auth-feedback--${type}`;
    element.hidden = false;
  }
  function clearFeedback(form) {
    const element = $('[data-auth-feedback]', form);
    if (!element) return;
    element.textContent = '';
    element.hidden = true;
  }
  function fieldError(form, field, message) {
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
  function validate(form) {
    let valid = true;
    let firstInvalid = null;
    const type = form.dataset.authForm;
    $$('input[name]', form).forEach(field => {
      const value = field.type === 'password'
        ? field.value
        : field.value.trim();
      let message = '';
      if (field.required && !value) {
        message = 'Bagian ini wajib diisi.';
      } else if (
        field.name === 'npm' &&
        value &&
        !NPM_PATTERN.test(value)
      ) {
        message = 'NPM harus terdiri dari 8 sampai 20 angka.';
      } else if (
        field.name === 'nama' &&
        value &&
        (value.length < 3 || value.length > 150)
      ) {
        message = 'Nama harus terdiri dari 3 sampai 150 karakter.';
      } else if (
        field.name === 'prodi' &&
        value &&
        (value.length < 2 || value.length > 150)
      ) {
        message = 'Program studi tidak valid.';
      } else if (
        field.name === 'email' &&
        value &&
        field.type === 'email' &&
        field.validity.typeMismatch
      ) {
        message = 'Format email tidak valid.';
      } else if (
        field.name === 'password' &&
        type === 'register' &&
        value.length < 8
      ) {
        message = 'Password minimal 8 karakter.';
      } else if (
        field.name === 'passwordConfirm' &&
        type === 'register' &&
        value !== (form.elements.namedItem('password')?.value || '')
      ) {
        message = 'Konfirmasi password tidak sama.';
      }
      fieldError(form, field, message);
      if (message) {
        valid = false;
        firstInvalid ||= field;
      }
    });
    firstInvalid?.focus();
    return valid;
  }
  function togglePassword(button) {
    const field = document.getElementById(
      button.dataset.togglePassword
    );
    if (!field) return;
    const visible = field.type === 'password';
    field.type = visible ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(visible));
    button.setAttribute(
      'aria-label',
      visible ? 'Sembunyikan password' : 'Tampilkan password'
    );
  }
  async function handleRegistration(form) {
    const payload = {
      nama: form.elements.namedItem('nama')?.value.trim() || '',
      npm: form.elements.namedItem('npm')?.value.trim() || '',
      prodi: form.elements.namedItem('prodi')?.value.trim() || '',
      email: form.elements.namedItem('email')?.value.trim() || '',
      password: form.elements.namedItem('password')?.value || '',
      passwordConfirm:
        form.elements.namedItem('passwordConfirm')?.value || ''
    };
    const result = await window.EPerpus.api.post(
      'auth/anggota-registrasi.php',
      payload
    );
    showFeedback(
      form,
      result.message || 'Registrasi berhasil. Silakan login.',
      'success'
    );
    form.reset();
    window.setTimeout(() => {
      window.location.href = '../login/anggota.html';
    }, 900);
  }
  async function handleLogin(form) {
    const result = await window.EPerpus.api.post(
      'auth/anggota-login.php',
      {
        npm: form.elements.namedItem('npm')?.value.trim() || '',
        password: form.elements.namedItem('password')?.value || ''
      }
    );
    window.EPerpus.setCurrentUser(result.user);
    showFeedback(
      form,
      result.message || 'Login berhasil.',
      'success'
    );
    window.setTimeout(() => {
      window.location.href = '../../anggota/beranda.html';
    }, 650);
  }
  function initializeForgotPassword() {
    const form = $(
      'form[data-auth-form="forgot-password"][data-user-role="anggota"]'
    );
    if (!form) return;
    const email = form.elements.namedItem('email');
    const password = form.elements.namedItem('password');
    const confirmation = form.elements.namedItem('password-confirm');
    const steps = $$('[data-forgot-step]', form);
    const digits = $$('[data-otp-digit]', form);
    const destination = $('[data-forgot-destination]', form);
    const feedback = $('[data-auth-feedback]', form);
    let currentStep = 1;
    let busy = false;
    const message = (text, type = 'info') => {
      if (!feedback) return;
      feedback.textContent = text;
      feedback.className = `auth-feedback auth-feedback--${type}`;
      feedback.hidden = false;
    };
    const showStep = number => {
      currentStep = number;
      steps.forEach(step => {
        const active = Number(step.dataset.forgotStep) === number;
        step.hidden = !active;
        step.classList.toggle('is-active', active);
      });
    };
    const button = action =>
      $(`[data-forgot-action="${action}"]`, form);
    async function requestCode() {
      const value = email?.value.trim() || '';
      if (
        !value ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ) {
        message('Masukkan alamat email yang valid.', 'error');
        email?.focus();
        return;
      }
      try {
        const result = await window.EPerpus.api.post(
          'auth/request-password-reset.php',
          {
            role: 'anggota',
            identity: value
          }
        );
        if (destination) {
          destination.textContent = result.destination || value;
        }
        message(result.message, 'success');
        showStep(2);
        digits[0]?.focus();
      } catch (error) {
        message(error.message, 'error');
      }
    }
    async function verifyCode() {
      const otp = digits
        .map(input => input.value.trim())
        .join('');
      if (!/^\d{6}$/.test(otp)) {
        message(
          'Masukkan seluruh 6 digit kode verifikasi.',
          'error'
        );
        return;
      }
      try {
        const result = await window.EPerpus.api.post(
          'auth/verify-password-reset.php',
          {
            role: 'anggota',
            otp
          }
        );
        message(result.message, 'success');
        showStep(3);
        password?.focus();
      } catch (error) {
        message(error.message, 'error');
      }
    }
    async function savePassword() {
      const newPassword = password?.value || '';
      const confirmPassword = confirmation?.value || '';
      if (
        newPassword.length < 8 ||
        newPassword !== confirmPassword
      ) {
        message(
          newPassword.length < 8
            ? 'Password minimal 8 karakter.'
            : 'Konfirmasi password tidak sama.',
          'error'
        );
        return;
      }
      if (busy) return;
      busy = true;
      const saveButton = button('save-password');
      if (saveButton) saveButton.disabled = true;
      try {
        const result = await window.EPerpus.api.post(
          'auth/reset-password.php',
          {
            password: newPassword,
            passwordConfirm: confirmPassword
          }
        );
        message(result.message, 'success');
        window.setTimeout(() => {
          window.location.href = '../login/anggota.html';
        }, 1000);
      } catch (error) {
        message(error.message, 'error');
      } finally {
        busy = false;
        if (saveButton) saveButton.disabled = false;
      }
    }
    button('send-otp')?.addEventListener('click', requestCode);
    button('verify-otp')?.addEventListener('click', verifyCode);
    button('resend-otp')?.addEventListener('click', requestCode);
    button('save-password')?.addEventListener('click', savePassword);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (currentStep === 1) {
        requestCode();
      } else if (currentStep === 2) {
        verifyCode();
      } else {
        savePassword();
      }
    });
    digits.forEach((input, index) => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 1);
        if (input.value && digits[index + 1]) {
          digits[index + 1].focus();
        }
      });
      input.addEventListener('keydown', event => {
        if (event.key === 'Backspace' && !input.value) {
          digits[index - 1]?.focus();
        }
      });
    });
    $$('[data-toggle-password]', form).forEach(item => {
      item.addEventListener('click', () => togglePassword(item));
    });
    showStep(1);
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
      if (form.dataset.authForm === 'register') {
        await handleRegistration(form);
      } else if (form.dataset.authForm === 'login') {
        await handleLogin(form);
      }
    } catch (error) {
      console.error('Autentikasi anggota gagal:', error);
      showFeedback(
        form,
        error.message || 'Permintaan gagal diproses.',
        'error'
      );
    } finally {
      if (submit && document.contains(submit)) {
        submit.disabled = false;
        submit.textContent = original;
      }
    }
  }
  function initialize() {
    $$('form[data-auth-form]:not([data-auth-form="forgot-password"])')
      .forEach(form => {
        form.addEventListener('submit', handleSubmit);
        form.addEventListener('input', event => {
          const field = event.target;
          if (field.name) {
            const message =
              field.required && !field.value.trim()
                ? 'Bagian ini wajib diisi.'
                : '';
            fieldError(form, field, message);
          }
          clearFeedback(form);
        });
      });
    document.addEventListener('click', event => {
      const button = event.target instanceof Element
        ? event.target.closest('[data-toggle-password]')
        : null;
      if (button) togglePassword(button);
    });
    initializeForgotPassword();
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
