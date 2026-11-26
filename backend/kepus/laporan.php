<?php
// Menyajikan rekap aktivitas dan transaksi perpustakaan.

require_once __DIR__ . '/../shared/auth.php';
require_method('GET');
require_role(['kepus']);
try {
    $pdo = db();
    $period = trim(
        (string) ($_GET['period'] ?? date('Y-m'))
    );
    if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $period)) {
        json_response([
            'success' => false,
            'message' => 'Periode harus menggunakan format YYYY-MM.'
        ], 422);
    }
    $periodStart = $period . '-01';
    $periodEnd = (
        new DateTimeImmutable($periodStart)
    )->modify('first day of next month')->format('Y-m-d');
    $summaryQuery = $pdo->prepare("

        SELECT

            (
                SELECT COUNT(*)
                FROM buku
                WHERE book_status = 'active'
            ) AS total_titles,

            (
                SELECT COALESCE(SUM(total_stock), 0)
                FROM buku
                WHERE book_status = 'active'
            ) AS total_copies,

            (
                SELECT COALESCE(SUM(available_stock), 0)
                FROM buku
                WHERE book_status = 'active'
            ) AS available_copies,

            (
                SELECT COUNT(*)
                FROM profil_anggota a

                INNER JOIN akun_pengguna u
                    ON u.id = a.user_id

                INNER JOIN jenis_pengguna r
                    ON r.id = u.role_id

                WHERE r.role_code = 'anggota'
                  AND u.account_status = 'active'
            ) AS total_members,

            (
                SELECT COUNT(*)
                FROM transaksi_peminjaman

                WHERE loan_date >= :period_start
                  AND loan_date < :period_end
            ) AS total_loans,

            (
                SELECT COUNT(*)
                FROM transaksi_peminjaman

                WHERE status = 'borrowed'
                  AND loan_date >= :borrowed_start
                  AND loan_date < :borrowed_end
            ) AS borrowed_in_period,

            (
                SELECT COUNT(*)
                FROM transaksi_peminjaman

                WHERE status = 'returned'
                  AND returned_at >= :returned_start
                  AND returned_at < :returned_end
            ) AS returned_in_period,

            (
                SELECT COUNT(*)
                FROM transaksi_peminjaman

                WHERE status = 'borrowed'
                  AND due_date < CURRENT_DATE
            ) AS overdue_current

    ");
    $summaryQuery->execute([
        'period_start' => $periodStart,
        'period_end' => $periodEnd,
        'borrowed_start' => $periodStart,
        'borrowed_end' => $periodEnd,
        'returned_start' => $periodStart,
        'returned_end' => $periodEnd,
    ]);
    $summary = $summaryQuery->fetch();
    if (!is_array($summary)) {
        throw new RuntimeException(
            'Ringkasan laporan tidak berhasil dibaca.'
        );
    }
    foreach ($summary as $key => $value) {
        $summary[$key] = (int) $value;
    }
    $categoryQuery = $pdo->prepare("

        SELECT

            COALESCE(
                k.category_name,
                'Tanpa kategori'
            ) AS category_name,

            COUNT(t.id) AS total_loans

        FROM transaksi_peminjaman t

        INNER JOIN buku b
            ON b.id = t.book_id

        LEFT JOIN kategori_buku k
            ON k.id = b.category_id

        WHERE t.loan_date >= :period_start
          AND t.loan_date < :period_end

        GROUP BY
            k.id,
            k.category_name

        ORDER BY
            total_loans DESC,
            category_name ASC

    ");
    $categoryQuery->execute([
        'period_start' => $periodStart,
        'period_end' => $periodEnd,
    ]);
    $categoryDistribution = $categoryQuery->fetchAll();
    foreach ($categoryDistribution as &$item) {
        $item['total_loans'] =
            (int) $item['total_loans'];
    }
    unset($item);
    $topBooksQuery = $pdo->prepare("

        SELECT

            b.id,
            b.book_code,
            b.title,

            COALESCE(
                k.category_name,
                'Tanpa kategori'
            ) AS category_name,

            COUNT(t.id) AS total_loans

        FROM transaksi_peminjaman t

        INNER JOIN buku b
            ON b.id = t.book_id

        LEFT JOIN kategori_buku k
            ON k.id = b.category_id

        WHERE t.loan_date >= :period_start
          AND t.loan_date < :period_end

        GROUP BY
            b.id,
            b.book_code,
            b.title,
            k.category_name

        ORDER BY
            total_loans DESC,
            b.title ASC

        LIMIT 10

    ");
    $topBooksQuery->execute([
        'period_start' => $periodStart,
        'period_end' => $periodEnd,
    ]);
    $topBooks = $topBooksQuery->fetchAll();
    foreach ($topBooks as &$item) {
        $item['id'] = (int) $item['id'];
        $item['total_loans'] =
            (int) $item['total_loans'];
    }
    unset($item);
    $monthlyQuery = $pdo->query("

        SELECT

            DATE_FORMAT(
                loan_date,
                '%Y-%m'
            ) AS month,

            COUNT(*) AS total_loans

        FROM transaksi_peminjaman

        WHERE loan_date >= DATE_SUB(

            CURRENT_DATE - INTERVAL
            (DAYOFMONTH(CURRENT_DATE) - 1) DAY,

            INTERVAL 5 MONTH

        )

        AND loan_date < DATE_ADD(
            CURRENT_DATE,
            INTERVAL 1 DAY
        )

        GROUP BY
            DATE_FORMAT(loan_date, '%Y-%m')

        ORDER BY month ASC

    ");
    $monthlyTrend = $monthlyQuery->fetchAll();
    foreach ($monthlyTrend as &$item) {
        $item['total_loans'] =
            (int) $item['total_loans'];
    }
    unset($item);
    $transactionsQuery = $pdo->prepare("

        SELECT

            t.id,
            t.loan_code,
            t.loan_date,
            t.due_date,
            t.returned_at,
            t.status,

            a.npm,
            a.full_name,

            b.book_code,
            b.title,

            COALESCE(
                k.category_name,
                'Tanpa kategori'
            ) AS category_name

        FROM transaksi_peminjaman t

        INNER JOIN profil_anggota a
            ON a.user_id = t.member_user_id

        INNER JOIN buku b
            ON b.id = t.book_id

        LEFT JOIN kategori_buku k
            ON k.id = b.category_id

        WHERE t.loan_date >= :period_start
          AND t.loan_date < :period_end

        ORDER BY
            t.loan_date DESC,
            t.id DESC

    ");
    $transactionsQuery->execute([
        'period_start' => $periodStart,
        'period_end' => $periodEnd,
    ]);
    $transactions = $transactionsQuery->fetchAll();
    foreach ($transactions as &$transaction) {
        $transaction['id'] =
            (int) $transaction['id'];
    }
    unset($transaction);
    $recentTransactions = array_slice(
        $transactions,
        0,
        10
    );
    json_response([
        'success' => true,
        'period' => $period,
        'summary' => $summary,
        'category_distribution' =>
            $categoryDistribution,
        'top_books' =>
            $topBooks,
        'monthly_trend' =>
            $monthlyTrend,
        'transactions' =>
            $transactions,
        'recent_transactions' =>
            $recentTransactions,
    ]);
} catch (Throwable $exception) {
    handle_server_error($exception);
}
