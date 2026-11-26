<?php
// Menghitung minat baca berdasarkan riwayat peminjaman anggota aktif.

require_once __DIR__ . '/../shared/auth.php';
require_method('GET');
$currentUser = require_role(['anggota']);
 const EPERPUSTAKAAN_MIN_PERSONAL_BORROWINGS = 3;
function eperpus_personal_category_key(
    ?string $categoryName
): ?string {
    $text = trim((string) $categoryName);
    if ($text === '') {
        return null;
    }
    $text = preg_replace('/\s+/u', ' ', $text) ?? $text;
    $text = function_exists('mb_strtolower')
        ? mb_strtolower($text, 'UTF-8')
        : strtolower($text);
    if (
        str_contains($text, 'informatika') ||
        str_contains($text, 'komputer') ||
        str_contains($text, 'teknologi')
    ) {
        return 'informatika';
    }
    if (
        str_contains($text, 'sains') ||
        str_contains($text, 'matematika')
    ) {
        return 'sains';
    }
    if (
        str_contains($text, 'sastra') ||
        str_contains($text, 'bahasa')
    ) {
        return 'sastra';
    }
    if (
        str_contains($text, 'sosial') ||
        str_contains($text, 'bisnis') ||
        str_contains($text, 'ekonomi') ||
        str_contains($text, 'manajemen')
    ) {
        return 'sosial';
    }
    return null;
}
try {
    $pdo = db();
    $currentUserId = (int) (
        $currentUser['id'] ??
        $currentUser['user_id'] ??
        0
    );
    if ($currentUserId < 1) {
        json_response([
            'success' => false,
            'message' => 'Identitas anggota tidak valid.'
        ], 401);
    }
    $categoryLabels = [
        'informatika' => 'Informatika & Komputer',
        'sains' => 'Sains & Matematika',
        'sastra' => 'Sastra & Bahasa',
        'sosial' => 'Sosial & Bisnis',
    ];
    $borrowCounts = array_fill_keys(
        array_keys($categoryLabels),
        0
    );
    $sql = "

        SELECT

            kb.id AS category_id,

            kb.category_name,

            COUNT(tp.id) AS total_peminjaman

        FROM transaksi_peminjaman tp

        LEFT JOIN buku b
            ON b.id = tp.book_id

        LEFT JOIN kategori_buku kb
            ON kb.id = b.category_id

        WHERE tp.member_user_id = :member_user_id

        GROUP BY

            kb.id,

            kb.category_name

        ORDER BY

            kb.category_name ASC

    ";
    $query = $pdo->prepare($sql);
    $query->execute([
        'member_user_id' => $currentUserId
    ]);
    $rows = $query->fetchAll(PDO::FETCH_ASSOC);
    $totalBorrowings = 0;
    $categorizedBorrowings = 0;
    $unmappedCategories = [];
    foreach ($rows as $row) {
        $count = (int) (
            $row['total_peminjaman'] ?? 0
        );
        if ($count < 1) {
            continue;
        }
        $totalBorrowings += $count;
        $categoryName = (string) (
            $row['category_name'] ?? ''
        );
        $categoryKey = eperpus_personal_category_key(
            $categoryName
        );
        if ($categoryKey === null) {
            $unmappedName = trim($categoryName) !== ''
                ? trim($categoryName)
                : '(Kategori belum ditentukan)';
            $unmappedCategories[$unmappedName] =
                ($unmappedCategories[$unmappedName] ?? 0)
                + $count;
            continue;
        }
        $borrowCounts[$categoryKey] += $count;
        $categorizedBorrowings += $count;
    }
    $categoryStatistics = [];
    foreach ($categoryLabels as $key => $label) {
        $count = (int) $borrowCounts[$key];
        $percentage = $categorizedBorrowings > 0
            ? round(
                ($count / $categorizedBorrowings) * 100,
                2
            )
            : 0;
        $categoryStatistics[] = [
            'key' => $key,
            'label' => $label,
            'total_borrowings' => $count,
            'percentage' => $percentage,
        ];
    }
    usort(
        $categoryStatistics,
        static function (array $a, array $b): int {
            if (
                $a['total_borrowings'] !==
                $b['total_borrowings']
            ) {
                return $b['total_borrowings'] <=>
                    $a['total_borrowings'];
            }
            return strcmp(
                $a['label'],
                $b['label']
            );
        }
    );
    $memberProfile = [
        'total_borrowings' => $totalBorrowings,
        'categorized_borrowings' => $categorizedBorrowings,
        'minimum_required' =>
            EPERPUSTAKAAN_MIN_PERSONAL_BORROWINGS,
        'remaining' => max(
            0,
            EPERPUSTAKAAN_MIN_PERSONAL_BORROWINGS
                - $categorizedBorrowings
        ),
        'borrow_counts' => $borrowCounts,
    ];
    if (
        $categorizedBorrowings <
        EPERPUSTAKAAN_MIN_PERSONAL_BORROWINGS
    ) {
        json_response([
            'success' => true,
            'message' =>
                'Minat baca belum tersedia. Diperlukan minimal tiga transaksi peminjaman berkategori.',
            'data' => [
                'status' => 'insufficient_member_history',
                'prediction' => null,
                'method' => [
                    'name' =>
                        'Dominasi Frekuensi Peminjaman',
                    'basis' =>
                        'Riwayat peminjaman pribadi anggota',
                    'rule' =>
                        'Kategori dengan jumlah peminjaman terbanyak',
                ],
                'member_profile' => $memberProfile,
                'category_statistics' =>
                    $categoryStatistics,
                'unmapped_categories' =>
                    $unmappedCategories,
            ],
        ]);
    }
    $maximumBorrowings = max($borrowCounts);
    $topCategories = [];
    foreach ($borrowCounts as $key => $count) {
        if ($count === $maximumBorrowings) {
            $topCategories[] = $key;
        }
    }
    if (count($topCategories) > 1) {
        $topLabels = array_map(
            static fn (string $key): string =>
                $categoryLabels[$key],
            $topCategories
        );
        json_response([
            'success' => true,
            'message' =>
                'Minat baca belum dapat ditentukan karena terdapat beberapa kategori dengan jumlah peminjaman yang sama.',
            'data' => [
                'status' => 'ambiguous_interest',
                'prediction' => null,
                'top_categories' => $topLabels,
                'method' => [
                    'name' =>
                        'Dominasi Frekuensi Peminjaman',
                    'basis' =>
                        'Riwayat peminjaman pribadi anggota',
                    'rule' =>
                        'Kategori dengan jumlah peminjaman terbanyak',
                ],
                'member_profile' => $memberProfile,
                'category_statistics' =>
                    $categoryStatistics,
            ],
        ]);
    }
    $winningCategory = $topCategories[0];
    $winningPercentage = round(
        (
            $maximumBorrowings /
            $categorizedBorrowings
        ) * 100,
        2
    );
    json_response([
        'success' => true,
        'message' =>
            'Minat baca personal berhasil ditentukan berdasarkan riwayat peminjaman.',
        'data' => [
            'status' => 'predicted',
            'prediction' => [
                'key' => $winningCategory,
                'label' =>
                    $categoryLabels[$winningCategory],
                'total_borrowings' =>
                    $maximumBorrowings,
                'percentage' =>
                    $winningPercentage,
            ],
            'method' => [
                'name' =>
                    'Dominasi Frekuensi Peminjaman',
                'basis' =>
                    'Riwayat peminjaman pribadi anggota',
                'rule' =>
                    'Kategori dengan jumlah peminjaman terbanyak',
            ],
            'member_profile' => $memberProfile,
            'category_statistics' =>
                $categoryStatistics,
            'unmapped_categories' =>
                $unmappedCategories,
        ],
    ]);
} catch (Throwable $exception) {
    handle_server_error($exception);
}
