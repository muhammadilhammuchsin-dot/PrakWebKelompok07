(() => {
  'use strict';
  const API_ENDPOINT = 'pustakawan/kelola-anggota.php';
  const PAGE_LIMIT = 100;
  const $ = (selector, root = document) =>
    root.querySelector(selector);
  const tableBody = $('.data-table tbody');
  const searchInput = $('#keyword');
  let members = [];
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
  function normalizeMember(data) {
    return {
      userId: Number(data.user_id || data.id) || null,
      name: String(
        data.full_name || data.nama || ''
      ).trim(),
      email: String(
        data.email || ''
      ).trim(),
      npm: String(
        data.npm || ''
      ).trim(),
      program: String(
        data.study_program || data.prodi || ''
      ).trim(),
      status: String(
        data.account_status || data.status || ''
      ).trim()
    };
  }
  async function fetchMembers() {
    if (!window.EPerpus?.api?.get) {
      throw new Error(
        'API belum tersedia. Periksa pemanggilan shared/app.js.'
      );
    }
    const allMembers = [];
    let page = 1;
    let totalPages = 1;
    do {
      const response = await window.EPerpus.api.get(
        API_ENDPOINT,
        {
          page: page,
          limit: PAGE_LIMIT,
          status: 'active'
        }
      );
      if (!Array.isArray(response.data)) {
        throw new Error(
          'Data anggota dari server tidak valid.'
        );
      }
      response.data.forEach(item => {
        allMembers.push(
          normalizeMember(item)
        );
      });
      totalPages = Math.max(
        1,
        Number(response.pagination?.total_pages) || 1
      );
      page++;
    } while (page <= totalPages);
    return allMembers;
  }
  function showTableMessage(message, type = 'empty') {
    if (!tableBody) return;
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'member-empty-state';
    cell.textContent = message;
    cell.style.textAlign = 'center';
    cell.style.padding = '24px';
    cell.setAttribute('role', 'status');
    if (type === 'error') {
      cell.style.color = '#dc2626';
    }
    row.appendChild(cell);
    tableBody.replaceChildren(row);
  }
  function getProgramColor(program) {
    const value = String(program).toLowerCase();
    if (value.includes('informatika')) {
      return '#2563eb';
    }
    if (value.includes('mesin')) {
      return '#64748b';
    }
    if (value.includes('farmasi')) {
      return '#0f766e';
    }
    if (value.includes('ekonomi')) {
      return '#2563eb';
    }
    if (value.includes('kedokteran')) {
      return '#0b2a6f';
    }
    return '#0b2a6f';
  }
  function createMemberCell(member) {
    const cell = document.createElement('td');
    const container = document.createElement('div');
    container.className = 'member';
    const avatar = document.createElement('span');
    avatar.className = 'member__initial';
    avatar.textContent =
      member.name.charAt(0).toUpperCase() || '?';
    const information = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = member.name || '-';
    const email = document.createElement('span');
    email.className = 'member__email';
    email.textContent = member.email || '';
    information.appendChild(name);
    if (member.email) {
      information.appendChild(email);
    }
    container.appendChild(avatar);
    container.appendChild(information);
    cell.appendChild(container);
    return cell;
  }
  function createNpmCell(member) {
    const cell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'pill pill--code';
    badge.textContent = member.npm || '-';
    cell.appendChild(badge);
    return cell;
  }
  function createProgramCell(member) {
    const cell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'pill pill--category';
    const dot = document.createElement('span');
    dot.setAttribute('aria-hidden', 'true');
    dot.style.display = 'inline-block';
    dot.style.width = '6px';
    dot.style.height = '6px';
    dot.style.minWidth = '6px';
    dot.style.borderRadius = '50%';
    dot.style.marginRight = '7px';
    dot.style.backgroundColor =
      getProgramColor(member.program);
    const label = document.createElement('span');
    label.textContent = member.program || '-';
    badge.appendChild(dot);
    badge.appendChild(label);
    cell.appendChild(badge);
    return cell;
  }
  function createDeleteButton(member) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--delete btn--small';
    button.dataset.action = 'delete-member';
    button.dataset.memberId = String(
      member.userId || ''
    );
    button.dataset.memberNpm = member.npm;
    button.setAttribute(
      'aria-label',
      `Hapus anggota ${member.name}`
    );
    const icon = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    );
    icon.setAttribute('class', 'icon icon--sm');
    icon.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'use'
    );
    use.setAttribute('href', '#i-trash');
    icon.appendChild(use);
    const text = document.createElement('span');
    text.textContent = 'Hapus';
    button.appendChild(icon);
    button.appendChild(text);
    return button;
  }
  function filterMembers() {
    const keyword = String(
      searchInput?.value || ''
    )
      .trim()
      .toLocaleLowerCase('id-ID');
    if (!keyword) {
      return [...members];
    }
    return members.filter(member => {
      const searchable = [
        member.name,
        member.email,
        member.npm,
        member.program
      ];
      return searchable.some(value =>
        String(value)
          .toLocaleLowerCase('id-ID')
          .includes(keyword)
      );
    });
  }
  function renderMembers() {
    if (!tableBody) return;
    const filteredMembers = filterMembers();
    if (members.length === 0) {
      showTableMessage(
        'Belum ada anggota yang terdaftar.'
      );
      return;
    }
    if (filteredMembers.length === 0) {
      showTableMessage(
        'Anggota yang dicari tidak ditemukan.'
      );
      return;
    }
    const fragment = document.createDocumentFragment();
    filteredMembers.forEach((member, index) => {
      const row = document.createElement('tr');
      const numberCell = document.createElement('td');
      numberCell.textContent = String(index + 1);
      row.appendChild(numberCell);
      row.appendChild(
        createMemberCell(member)
      );
      row.appendChild(
        createNpmCell(member)
      );
      row.appendChild(
        createProgramCell(member)
      );
      const actionCell = document.createElement('td');
      actionCell.appendChild(
        createDeleteButton(member)
      );
      row.appendChild(actionCell);
      fragment.appendChild(row);
    });
    tableBody.replaceChildren(fragment);
  }
  async function loadMembers() {
    if (isLoading) return;
    isLoading = true;
    showTableMessage('Memuat data anggota...');
    try {
      members = await fetchMembers();
      renderMembers();
      console.info(
        'Data anggota berhasil dimuat:',
        members.length
      );
    } catch (error) {
      console.error(
        'Kesalahan memuat anggota:',
        error
      );
      showTableMessage(
        'Gagal mengambil data anggota. ' + error.message,
        'error'
      );
      notify(
        error.message || 'Gagal memuat data anggota.',
        'error'
      );
    } finally {
      isLoading = false;
    }
  }
  async function deleteMember(button) {
    const userId = Number(
      button.dataset.memberId
    );
    const npm = String(
      button.dataset.memberNpm || ''
    ).trim();
    if (!userId && !npm) {
      notify(
        'Identitas anggota tidak ditemukan.',
        'error'
      );
      return;
    }
    const member = members.find(item =>
      (userId && item.userId === userId) ||
      (npm && item.npm === npm)
    );
    if (!member) {
      notify(
        'Data anggota tidak ditemukan.',
        'error'
      );
      return;
    }
    const confirmation = await window.EPerpus.confirm(
      `Apakah Anda yakin ingin menghapus anggota ${member.name}?\n\nAnggota akan dihapus dari daftar aktif. Riwayat transaksi tetap disimpan.`,
      {
        title: 'Hapus Anggota?',
        confirmText: 'Ya, Hapus',
        cancelText: 'Batal',
        danger: true
      }
    );
    if (!confirmation) return;
    button.disabled = true;
    try {
      const response = await window.EPerpus.api.post(
        API_ENDPOINT,
        {
          action: 'delete',
          user_id: member.userId || undefined,
          npm: member.userId ? undefined : member.npm
        }
      );
      notify(
        response.message || 'Anggota berhasil dihapus.',
        'success'
      );
      await loadMembers();
    } catch (error) {
      console.error(
        'Gagal menghapus anggota:',
        error
      );
      notify(
        error.message || 'Anggota gagal dihapus.',
        'error'
      );
      button.disabled = false;
    }
  }
  if (searchInput) {
    searchInput.addEventListener(
      'input',
      renderMembers
    );
    searchInput.addEventListener(
      'keydown',
      event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          renderMembers();
        }
      }
    );
  }
  document.addEventListener('click', event => {
    const target = event.target instanceof Element
      ? event.target
      : null;
    if (!target) return;
    const searchButton = target.closest(
      '[data-action="search-members"]'
    );
    if (searchButton) {
      renderMembers();
      searchInput?.focus();
      return;
    }
    const deleteButton = target.closest(
      '[data-action="delete-member"]'
    );
    if (deleteButton) {
      deleteMember(deleteButton);
    }
  });
  function initialize() {
    loadMembers();
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
