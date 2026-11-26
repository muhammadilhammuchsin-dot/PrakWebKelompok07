(() => {
  'use strict';
  const CURRENT_USER_URL = new URL('../../../backend/auth/current-user.php', window.location.href).href;
  const adminName =
    document.getElementById('adminName');
  const adminNip =
    document.getElementById('adminNip');
  function renderProfile(name, nip) {
    if (adminName) {
      adminName.textContent = name;
    }
    if (adminNip) {
      adminNip.textContent = nip;
    }
  }
  async function loadAdminProfile() {
    if (!adminName || !adminNip) {
      console.error(
        'Elemen adminName atau adminNip tidak ditemukan.'
      );
      return;
    }
    renderProfile(
      'Memuat profil...',
      'Menghubungkan ke database...'
    );
    try {
      const response = await fetch(
        CURRENT_USER_URL,
        {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'Accept': 'application/json'
          }
        }
      );
      const raw = await response.text();
      let result;
      try {
        result = JSON.parse(raw);
      } catch (error) {
        throw new Error(
          `Respons PHP bukan JSON. HTTP ${response.status}. ` +
          raw.substring(0, 300)
        );
      }
      console.log(
        'Respons current-user.php:',
        result
      );
      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
          `Permintaan gagal. HTTP ${response.status}`
        );
      }
      if (
        result.authenticated !== true ||
        !result.user
      ) {
        renderProfile(
          'Belum login',
          'Silakan login kembali.'
        );
        console.warn(
          'Session PHP belum ditemukan.'
        );
        return;
      }
      const user = result.user;
      const role =
        user.role_code || user.role || '';
      if (role !== 'pustakawan') {
        throw new Error(
          `Role tidak sesuai: ${role}`
        );
      }
      const nama = String(
        user.full_name ||
        user.name ||
        user.nama ||
        ''
      ).trim();
      const nip = String(
        user.nip ||
        user.login_identifier ||
        user.npm ||
        ''
      ).trim();
      renderProfile(
        nama || 'Nama belum tersedia',
        nip || 'NIP belum tersedia'
      );
      console.log(
        'Profil Pustakawan berhasil dimuat.',
        {
          nama: nama,
          nip: nip,
          role: role
        }
      );
    } catch (error) {
      console.error(
        'KESALAHAN MEMUAT PROFIL:',
        error
      );
      renderProfile(
        'Profil gagal dimuat',
        'Periksa koneksi backend'
      );
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      loadAdminProfile,
      { once: true }
    );
  } else {
    loadAdminProfile();
  }
})();
