(() => {
    'use strict';
    const DISPLAY_LIMIT = 10;
    const PAGE_LIMIT = 50;
    const API_ENDPOINT = 'anggota/cari-buku.php';
    const grid = document.querySelector(
        '.home-books:not([data-knn-section]) .book-grid'
    );
    function createCard(row) {
        const code = String(
            row.id_buku ||
            row.book_code ||
            row.id ||
            ''
        ).trim();
        const titleText = String(
            row.judul ||
            row.title ||
            'Tanpa judul'
        );
        const descriptionText = String(
            row.deskripsi ||
            row.description ||
            'Deskripsi buku belum tersedia.'
        ).trim() || 'Deskripsi buku belum tersedia.';
        const borrowCount = Math.max(
            0,
            Number(
                row.borrow_count ??
                row.jumlah_dipinjam ??
                0
            ) || 0
        );
        const imagePath = row.cover_path || row.gambar || '';
        const card = document.createElement('article');
        card.className = 'book-card';
        card.dataset.bookId = code;
        const figure = document.createElement('figure');
        figure.className = 'cover cover--banner';
        const showCoverPlaceholder = () => {
            figure.classList.add('cover--placeholder');
            figure.textContent = 'Sampul belum tersedia';
        };
        if (imagePath || code) {
            const image = document.createElement('img');
            image.className = 'cover__image';
            image.alt = `Sampul buku ${titleText}`;
            image.loading = 'lazy';
            figure.appendChild(image);
            if (window.EPerpusCovers?.setSource) {
                window.EPerpusCovers.setSource(
                    image,
                    imagePath,
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
        const title = document.createElement('h3');
        title.className = 'book-card__title';
        title.textContent = titleText;
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = `dipinjam ${borrowCount}x`;
        badge.setAttribute(
            'aria-label',
            `Telah dipinjam ${borrowCount} kali`
        );
        const description = document.createElement('p');
        description.className = 'book-card__text';
        description.textContent = descriptionText;
        const link = document.createElement('a');
        link.className = 'btn btn--navy btn--block btn--small';
        link.href = `detail.html?id=${encodeURIComponent(code)}`;
        link.dataset.route = link.getAttribute('href');
        link.setAttribute(
            'aria-label',
            `Detail buku ${titleText}`
        );
        link.appendChild(
            document.createTextNode('Detail ')
        );
        const icon = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'svg'
        );
        icon.classList.add('icon', 'icon--sm');
        icon.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'use'
        );
        use.setAttribute('href', '#i-info');
        icon.appendChild(use);
        link.appendChild(icon);
        card.append(
            figure,
            title,
            badge,
            description,
            link
        );
        return card;
    }
    async function getAllBooks() {
        if (!window.EPerpus?.api?.get) {
            throw new Error(
                'Modul API belum dimuat. Periksa shared/app.js.'
            );
        }
        const records = [];
        let page = 1;
        let totalPages = 1;
        do {
            const result = await window.EPerpus.api.get(
                API_ENDPOINT,
                {
                    page,
                    limit: PAGE_LIMIT
                }
            );
            if (!Array.isArray(result.data)) {
                throw new Error(
                    'Format data buku dari backend tidak sesuai.'
                );
            }
            records.push(...result.data);
            totalPages = Math.max(
                1,
                Number(result.pagination?.total_pages) || 1
            );
            page += 1;
        } while (page <= totalPages);
        return records;
    }
    function sortNewestFirst(a, b) {
        const dateA = String(a.created_at || '');
        const dateB = String(b.created_at || '');
        const dateComparison = dateB.localeCompare(dateA);
        if (dateComparison !== 0) {
            return dateComparison;
        }
        return (
            (Number(b.id) || 0) -
            (Number(a.id) || 0)
        );
    }
    function showMessage(message) {
        const paragraph = document.createElement('p');
        paragraph.className = 'catalog-empty-state';
        paragraph.setAttribute('role', 'status');
        paragraph.textContent = message;
        grid.replaceChildren(paragraph);
    }
    async function initialize() {
        if (!grid) return;
        showMessage('Memuat buku terbaru...');
        try {
            const records = await getAllBooks();
            records.sort(sortNewestFirst);
            const latestBooks = records.slice(
                0,
                DISPLAY_LIMIT
            );
            grid.replaceChildren();
            if (latestBooks.length === 0) {
                showMessage(
                    'Belum ada buku yang ditambahkan oleh Pustakawan.'
                );
                return;
            }
            const fragment = document.createDocumentFragment();
            latestBooks.forEach(book => {
                fragment.appendChild(
                    createCard(book)
                );
            });
            grid.appendChild(fragment);
            console.info(
                `Beranda anggota: ${latestBooks.length} buku terbaru berhasil ditampilkan.`
            );
        } catch (error) {
            console.error(
                'Gagal memuat buku terbaru:',
                error
            );
            showMessage(
                error.message ||
                'Buku terbaru belum dapat dimuat.'
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
