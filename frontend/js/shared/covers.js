(() => {
  'use strict';
  // Menormalkan alamat sampul dan mencoba file lokal berdasarkan kode buku.
  const scriptUrl = document.currentScript?.src || window.location.href;
  const projectRoot = new URL('../../../', scriptUrl);
  function candidates(path, bookCode) {
    const urls = [];
    const add = value => {
      try {
        const url = new URL(value, projectRoot).href;
        if (!urls.includes(url)) urls.push(url);
      } catch (error) {
        console.warn('[E-Perpustakaan] Alamat sampul tidak valid:', value);
      }
    };
    const raw = String(path || '').trim();
    if (raw) {
      if (/^(https?:|data:|blob:)/i.test(raw)) {
        add(raw);
      } else {
        let value = raw.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
        const fullMarker = 'frontend/assets/covers/';
        let index = value.toLowerCase().indexOf(fullMarker);
        if (index >= 0) {
          value = value.slice(index);
        } else {
          const coverMarker = 'assets/covers/';
          index = value.toLowerCase().indexOf(coverMarker);
          if (index >= 0) {
            value = 'frontend/' + value.slice(index);
          } else {
            value = value.replace(/^\/+/, '');
            if (value.startsWith('assets/')) value = 'frontend/' + value;
            else if (!value.startsWith('frontend/') && !value.includes('/')) {
              value = 'frontend/assets/covers/' + value;
            }
          }
        }
        add(value);
      }
    }
    const code = String(bookCode || '').trim().replace(/\.(?:jpe?g|png|webp)$/i, '');
    if (code) {
      ['jpg', 'jpeg', 'png', 'webp'].forEach(extension => {
        add(`frontend/assets/covers/${encodeURIComponent(code)}.${extension}`);
      });
    }
    return urls;
  }
  function setSource(image, path, bookCode, onFailure) {
    const urls = candidates(path, bookCode);
    let index = 0;
    const tryNext = () => {
      if (index >= urls.length) {
        image.onerror = null;
        if (typeof onFailure === 'function') onFailure();
        return;
      }
      image.onerror = tryNext;
      image.src = urls[index++];
    };
    if (!urls.length) {
      if (typeof onFailure === 'function') onFailure();
      return;
    }
    tryNext();
  }
  window.EPerpusCovers = Object.freeze({ candidates, setSource });
})();
