(() => {
    'use strict';
    const API_ENDPOINT = 'kepus/laporan.php';
    const CATEGORIES = [
        {
            key: 'informatika',
            label: 'Teknologi & Informatika',
            color: '#0b2a6f'
        },
        {
            key: 'sains',
            label: 'Sains & Matematika',
            color: '#2563eb'
        },
        {
            key: 'sosial',
            label: 'Sosial & Bisnis',
            color: '#38bdf8'
        },
        {
            key: 'sastra',
            label: 'Sastra & Bahasa',
            color: '#94a3b8'
        }
    ];
    const BAR_CATEGORY_ORDER = [
        'informatika',
        'sains',
        'sastra',
        'sosial'
    ];
    const MONTHS = {
        januari: '01',
        februari: '02',
        maret: '03',
        april: '04',
        mei: '05',
        juni: '06',
        juli: '07',
        agustus: '08',
        september: '09',
        oktober: '10',
        november: '11',
        desember: '12'
    };
    const $ = (selector, root = document) =>
        root.querySelector(selector);
    const $$ = (selector, root = document) =>
        [...root.querySelectorAll(selector)];
    const periodSelect = $('#period');
    let lastValidPeriod = '';
    let requestSequence = 0;
    let activeReport = null;
    function toNumber(value) {
        const number = Number(value);
        return Number.isFinite(number)
            ? number
            : 0;
    }
    function normalizeText(value) {
        return String(value ?? '')
            .normalize('NFKC')
            .toLocaleLowerCase('id')
            .replace(/\s+/g, ' ')
            .trim();
    }
    function classifyCategory(value) {
        const category = normalizeText(value);
        if (!category) return '';
        if (
            category.includes('sains') ||
            category.includes('matematika')
        ) {
            return 'sains';
        }
        if (
            category.includes('sosial') ||
            category.includes('bisnis')
        ) {
            return 'sosial';
        }
        if (
            category.includes('sastra') ||
            category.includes('bahasa')
        ) {
            return 'sastra';
        }
        if (
            category.includes('informatika') ||
            category.includes('teknologi') ||
            category.includes('komputer') ||
            category.includes('sistem informasi')
        ) {
            return 'informatika';
        }
        return '';
    }
    function getPeriodValue(label) {
        const match = String(label ?? '')
            .trim()
            .toLocaleLowerCase('id')
            .match(/^([a-z]+)\s+(\d{4})$/);
        if (!match || !MONTHS[match[1]]) {
            return '';
        }
        return `${match[2]}-${MONTHS[match[1]]}`;
    }
    function initializePeriodOptions() {
        if (!periodSelect) return false;
        const validOptions = [];
        [...periodSelect.options].forEach(option => {
            const period = getPeriodValue(
                option.textContent
            );
            if (!period) {
                option.disabled = true;
                return;
            }
            option.value = period;
            validOptions.push(option);
        });
        if (validOptions.length === 0) {
            periodSelect.disabled = true;
            return false;
        }
        const now = new Date();
        const currentPeriod = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0')
        ].join('-');
        const selectedOption =
            validOptions.find(
                option => option.value === currentPeriod
            ) || validOptions[0];
        selectedOption.selected = true;
        lastValidPeriod = selectedOption.value;
        periodSelect.disabled = false;
        return true;
    }
    function showFeedback(message, type = 'info') {
        const feedback = $('[data-report-feedback]');
        if (!feedback) return;
        feedback.textContent = message;
        feedback.dataset.type = type;
    }
    function dispatchReport(report) {
        document.dispatchEvent(
            new CustomEvent('eperpus:report-updated', {
                detail: report
            })
        );
    }
    function setLoadingState() {
        $$('.stats .stat-card__value').forEach(element => {
            element.textContent = 'Memuat...';
        });
        const hole = $('.donut__hole');
        if (hole) {
            hole.textContent = '...';
        }
        $$('.legend__item strong').forEach(element => {
            element.textContent = '...';
        });
        $$('.bar-chart__item > span:first-child').forEach(element => {
            element.textContent = '...';
        });
        $$('.bar-chart__note').forEach(element => {
            element.textContent = 'Memuat...';
        });
        dispatchReport(null);
    }
    function setErrorState() {
        $$('.stats .stat-card__value').forEach(element => {
            element.textContent = '—';
        });
        const hole = $('.donut__hole');
        if (hole) {
            hole.textContent = '—';
        }
        $$('.legend__item strong').forEach(element => {
            element.textContent = '—';
        });
        $$('.bar-chart__item > span:first-child').forEach(element => {
            element.textContent = '—';
        });
        $$('.bar-chart__note').forEach(element => {
            element.textContent = '—';
        });
        const donut = $('.donut');
        if (donut) {
            donut.style.background =
                'conic-gradient(#e2e8f0 0% 100%)';
        }
        $$('.bar-chart__bar').forEach(bar => {
            bar.style.height = '0%';
            bar.style.minHeight = '0';
        });
        dispatchReport(null);
    }
    function renderSummary(report) {
        const values = $$('.stats .stat-card__value');
        if (values[0]) {
            values[0].textContent =
                report.members.toLocaleString('id-ID', {
                    minimumIntegerDigits: 3
                });
        }
        if (values[1]) {
            values[1].textContent =
                report.books.toLocaleString('id-ID');
        }
    }
    function buildCategoryCounts(rows, total) {
        const counts = {
            informatika: 0,
            sains: 0,
            sosial: 0,
            sastra: 0
        };
        (Array.isArray(rows) ? rows : []).forEach(row => {
            const key = classifyCategory(
                row.category_name
            );
            const count = toNumber(
                row.total_loans
            );
            if (
                key &&
                Object.prototype.hasOwnProperty.call(
                    counts,
                    key
                )
            ) {
                counts[key] += count;
            }
        });
        const classified = Object.values(counts)
            .reduce((sum, value) => sum + value, 0);
        return {
            counts,
            classified,
            unclassified: Math.max(
                0,
                total - classified
            )
        };
    }
    function renderDonut(report) {
        const donut = $('.donut');
        const hole = $('.donut__hole');
        const legendItems = $$('.legend__item');
        if (!donut || !hole) return;
        const gradientParts = [];
        let accumulated = 0;
        CATEGORIES.forEach((category, index) => {
            const count =
                report.counts[category.key] || 0;
            const percentage = report.total > 0
                ? (count / report.total) * 100
                : 0;
            const start = accumulated;
            accumulated += percentage;
            if (percentage > 0) {
                gradientParts.push(
                    `${category.color} ${start}% ${accumulated}%`
                );
            }
            const legendValue =
                legendItems[index]?.querySelector('strong');
            if (legendValue) {
                legendValue.textContent =
                    `${Math.round(percentage)}%`;
            }
            if (legendItems[index]) {
                legendItems[index].title =
                    `${count} transaksi peminjaman`;
            }
        });
        if (accumulated < 100) {
            gradientParts.push(
                `#e2e8f0 ${accumulated}% 100%`
            );
        }
        donut.style.background = gradientParts.length
            ? `conic-gradient(${gradientParts.join(', ')})`
            : 'conic-gradient(#e2e8f0 0% 100%)';
        hole.textContent = report.total > 0
            ? '100%'
            : '0%';
        donut.setAttribute(
            'aria-label',
            `Diagram distribusi ${report.total} transaksi peminjaman berdasarkan kategori`
        );
    }
    function renderBarChart(report) {
        const chart = $('.bar-chart');
        if (!chart) return;
        const items = $$('.bar-chart__item', chart);
        const labels = $$('.bar-chart__labels li', chart);
        BAR_CATEGORY_ORDER.forEach((categoryKey, index) => {
            const count =
                report.counts[categoryKey] || 0;
            const percentage = report.total > 0
                ? (count / report.total) * 100
                : 0;
            const item = items[index];
            const percentageLabel =
                item?.querySelector(':scope > span:first-child');
            const bar =
                item?.querySelector('.bar-chart__bar');
            if (percentageLabel) {
                percentageLabel.textContent =
                    `${Math.round(percentage)}%`;
            }
            if (bar) {
                bar.style.height =
                    `${percentage}%`;
                bar.style.minHeight = '0';
                bar.title =
                    `${count} transaksi`;
            }
            const note =
                labels[index]?.querySelector('.bar-chart__note');
            if (note) {
                note.textContent =
                    `${count.toLocaleString('id-ID')} transaksi`;
            }
        });
        chart.setAttribute(
            'aria-label',
            `Diagram peminjaman ${report.total} transaksi berdasarkan kategori`
        );
    }
    function buildReport(payload, period) {
        const summary = payload.summary || {};
        const total = toNumber(
            summary.total_loans
        );
        const categoryData = buildCategoryCounts(
            payload.category_distribution,
            total
        );
        const rows = Array.isArray(payload.transactions)
            ? payload.transactions
            : (
                Array.isArray(payload.recent_transactions)
                    ? payload.recent_transactions
                    : []
            );
        const transactions = rows.map(row => ({
            id: String(row.book_code || '-'),
            member: String(row.full_name || '-'),
            book: String(row.title || '-'),
            date: String(row.loan_date || ''),
            status: row.status === 'returned'
                ? 'Dikembalikan'
                : 'Dipinjam'
        }));
        const selectedOption =
            periodSelect?.selectedOptions?.[0];
        return {
            period,
            periodLabel:
                selectedOption?.textContent?.trim() || period,
            members: toNumber(summary.total_members),
            books: toNumber(summary.total_titles),
            total,
            counts: categoryData.counts,
            classified: categoryData.classified,
            unclassified: categoryData.unclassified,
            transactions,
            catalogComplete: true,
            summary,
            topBooks: Array.isArray(payload.top_books)
                ? payload.top_books
                : [],
            monthlyTrend: Array.isArray(payload.monthly_trend)
                ? payload.monthly_trend
                : []
        };
    }
    async function loadReport() {
        if (!periodSelect) return;
        const period = periodSelect.value;
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
            periodSelect.value = lastValidPeriod;
            showFeedback(
                'Periode laporan tidak valid.',
                'error'
            );
            return;
        }
        const sequence = ++requestSequence;
        lastValidPeriod = period;
        setLoadingState();
        showFeedback(
            `Memuat laporan periode ${period} dari database...`
        );
        try {
            const api = window.EPerpus?.api;
            if (!api || typeof api.get !== 'function') {
                throw new Error(
                    'Modul API belum tersedia. Pastikan shared/app.js dimuat sebelum laporan.js.'
                );
            }
            const payload = await api.get(
                API_ENDPOINT,
                { period }
            );
            if (sequence !== requestSequence) return;
            if (
                !payload?.success ||
                !payload.summary
            ) {
                throw new Error(
                    payload?.message ||
                    'Respons laporan dari server tidak lengkap.'
                );
            }
            const report = buildReport(
                payload,
                period
            );
            renderSummary(report);
            renderDonut(report);
            renderBarChart(report);
            let message =
                `Periode ${report.periodLabel}: ` +
                `${report.total.toLocaleString('id-ID')} transaksi peminjaman.`;
            if (report.unclassified > 0) {
                message +=
                    ` ${report.unclassified.toLocaleString('id-ID')} transaksi belum dapat dipetakan ke kategori buku.`;
            }
            showFeedback(message, 'success');
            activeReport = report;
            dispatchReport(report);
        } catch (error) {
            if (sequence !== requestSequence) return;
            console.error(
                'Gagal memuat laporan Kepala Perpustakaan:',
                error
            );
            activeReport = null;
            setErrorState();
            showFeedback(
                error.message ||
                'Laporan gagal dimuat dari database.',
                'error'
            );
        }
    }
    function initialize() {
        if (!periodSelect) {
            console.error(
                'Elemen #period tidak ditemukan pada halaman laporan.'
            );
            return;
        }
        if (!initializePeriodOptions()) {
            showFeedback(
                'Pilihan periode laporan tidak valid.',
                'error'
            );
            return;
        }
        periodSelect.addEventListener(
            'change',
            loadReport
        );
        document.addEventListener(
            'eperpus:data-updated',
            loadReport
        );
        loadReport();
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
