<?php
declare(strict_types=1);

// Mengklasifikasikan minat baca anggota menggunakan algoritma KNN.
require_once __DIR__ . '/../shared/auth.php';
require_once __DIR__ . '/../shared/knn.php';

require_method('GET');
$currentUser = require_role(['anggota']);

// Nilai K ditetapkan berdasarkan hasil pengujian dataset.
const EPERPUSTAKAAN_KNN_K = 9;

/**
 * Mengubah nama kategori buku menjadi salah satu
 * dari empat kategori klasifikasi.
 */
function eperpus_knn_category_key(?string $categoryName): ?string
{
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
        return 'teknologi';
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
            'message' => 'Identitas anggota tidak valid.',
        ], 401);
    }

    // Menentukan empat kategori klasifikasi.
    $categoryLabels = [
        'teknologi' => 'Teknologi & Informatika',
        'sains' => 'Sains & Matematika',
        'sastra' => 'Sastra & Bahasa',
        'sosial' => 'Sosial & Bisnis',
    ];

    $featureKeys = array_keys($categoryLabels);

    // Mengambil program studi dan riwayat peminjaman seluruh anggota.
    $sql = "
        SELECT
            pa.user_id,
            pa.study_program,
            kb.id AS category_id,
            kb.category_name,
            COUNT(tp.id) AS total_peminjaman
        FROM profil_anggota pa
        INNER JOIN akun_pengguna au
            ON au.id = pa.user_id
        INNER JOIN jenis_pengguna jp
            ON jp.id = au.role_id
            AND jp.role_code = 'anggota'
        LEFT JOIN transaksi_peminjaman tp
            ON tp.member_user_id = pa.user_id
        LEFT JOIN buku b
            ON b.id = tp.book_id
        LEFT JOIN kategori_buku kb
            ON kb.id = b.category_id
        GROUP BY
            pa.user_id,
            pa.study_program,
            kb.id,
            kb.category_name
        ORDER BY pa.user_id ASC
    ";

    $statement = $pdo->query($sql);
    $rows = $statement->fetchAll(PDO::FETCH_ASSOC);

    $members = [];

    // Mengelompokkan riwayat peminjaman berdasarkan anggota.
    foreach ($rows as $row) {
        $memberId = (int) ($row['user_id'] ?? 0);

        if ($memberId < 1) {
            continue;
        }

        if (!isset($members[$memberId])) {
            $members[$memberId] = [
                'user_id' => $memberId,
                'study_program' => trim(
                    (string) ($row['study_program'] ?? '')
                ),
                'borrow_counts' => array_fill_keys(
                    $featureKeys,
                    0
                ),
                'total_borrowings' => 0,
                'categorized_borrowings' => 0,
                'unmapped_categories' => [],
            ];
        }

        $count = (int) ($row['total_peminjaman'] ?? 0);

        if ($count < 1) {
            continue;
        }

        $members[$memberId]['total_borrowings'] += $count;

        $categoryName = (string) ($row['category_name'] ?? '');

        $categoryKey = eperpus_knn_category_key(
            $categoryName
        );

        if ($categoryKey === null) {
            $unmappedName = trim($categoryName) !== ''
                ? trim($categoryName)
                : '(Kategori belum ditentukan)';

            $members[$memberId]['unmapped_categories'][$unmappedName] =
                ($members[$memberId]['unmapped_categories'][$unmappedName] ?? 0)
                + $count;

            continue;
        }

        $members[$memberId]['borrow_counts'][$categoryKey] += $count;

        $members[$memberId]['categorized_borrowings'] += $count;
    }

    // Memastikan data anggota yang sedang login tersedia.
    if (!isset($members[$currentUserId])) {
        json_response([
            'success' => true,
            'message' => 'Profil anggota tidak ditemukan.',
            'data' => [
                'status' => 'no_member_features',
                'prediction' => null,
            ],
        ]);
    }

    $currentMember = $members[$currentUserId];

    $currentStudyProgram = trim(
        (string) $currentMember['study_program']
    );

    $currentBorrowCounts = $currentMember['borrow_counts'];

    if (
        $currentStudyProgram === '' &&
        $currentMember['categorized_borrowings'] < 1
    ) {
        json_response([
            'success' => true,
            'message' => 'Program studi dan riwayat peminjaman belum tersedia untuk proses klasifikasi.',
            'data' => [
                'status' => 'no_member_features',
                'prediction' => null,
            ],
        ]);
    }

    // Membentuk label data latih berdasarkan kategori peminjaman terbanyak.
    // Anggota yang sedang diprediksi tidak dimasukkan ke data latih.
    // Anggota dengan jumlah kategori tertinggi yang seri tidak digunakan.
    $trainingData = [];

    $trainingClassCounts = array_fill_keys(
        $featureKeys,
        0
    );

    foreach ($members as $memberId => $member) {
        if ((int) $memberId === $currentUserId) {
            continue;
        }

        $counts = $member['borrow_counts'];
        $maximum = max($counts);

        if ($maximum < 1) {
            continue;
        }

        $topKeys = [];

        foreach ($counts as $key => $count) {
            if ($count === $maximum) {
                $topKeys[] = $key;
            }
        }

        // Mengabaikan anggota yang memiliki label seri.
        if (count($topKeys) !== 1) {
            continue;
        }

        $labelKey = $topKeys[0];

        $trainingData[] = [
            'user_id' => (int) $memberId,
            'study_program' => $member['study_program'],
            'borrow_counts' => $counts,
            'label_key' => $labelKey,
        ];

        $trainingClassCounts[$labelKey]++;
    }

    // Memeriksa ketersediaan data latih.
    if ($trainingData === []) {
        json_response([
            'success' => true,
            'message' => 'Data latih berlabel belum mencukupi untuk klasifikasi KNN.',
            'data' => [
                'status' => 'training_data_unavailable',
                'prediction' => null,
                'member_profile' => [
                    'study_program' => $currentStudyProgram,
                    'total_borrowings' => $currentMember['total_borrowings'],
                    'categorized_borrowings' => $currentMember['categorized_borrowings'],
                    'borrow_counts' => $currentBorrowCounts,
                ],
            ],
        ]);
    }

    // Menjalankan algoritma KNN dengan K = 9.
    $knnResult = eperpus_knn_predict(
        [
            'study_program' => $currentStudyProgram,
            'borrow_counts' => $currentBorrowCounts,
        ],
        $trainingData,
        $categoryLabels,
        $featureKeys,
        EPERPUSTAKAAN_KNN_K
    );

    // Menyiapkan statistik peminjaman anggota.
    $categorizedBorrowings = (int) (
        $currentMember['categorized_borrowings']
    );

    $categoryStatistics = [];

    foreach ($categoryLabels as $key => $label) {
        $count = (int) $currentBorrowCounts[$key];

        $categoryStatistics[] = [
            'key' => $key,
            'label' => $label,
            'total_borrowings' => $count,
            'percentage' => $categorizedBorrowings > 0
                ? round(
                    ($count / $categorizedBorrowings) * 100,
                    2
                )
                : 0,
        ];
    }

    usort(
        $categoryStatistics,
        static function (array $a, array $b): int {
            if ($a['total_borrowings'] !== $b['total_borrowings']) {
                return $b['total_borrowings'] <=> $a['total_borrowings'];
            }

            return strcmp($a['label'], $b['label']);
        }
    );

    // Menyiapkan informasi metode untuk frontend.
    $method = [
        'name' => 'K-Nearest Neighbor (KNN)',
        'basis' => 'Program studi dan riwayat jumlah peminjaman pada empat kategori buku',
        'distance_metric' => 'Euclidean Distance',
        'program_encoding' => 'One-Hot Encoding',
        'numeric_scaling' => 'Min-Max Scaling berdasarkan data latih',
        'voting' => 'Majority Voting',
        'k_requested' => $knnResult['k_requested'],
        'k_used' => $knnResult['k_used'],
        'training_data_size' => $knnResult['training_data_size'],
        'tie_break_applied' => $knnResult['tie_break_applied'],
        'rule' => 'Kategori dengan suara terbanyak dari tetangga terdekat menjadi hasil klasifikasi.',
        'tie_break_rule' => 'Jika suara tertinggi sama, dipilih kategori dengan total jarak terkecil; jika masih sama, dipilih kategori dari tetangga terdekat.',
    ];

    // Mengirimkan hasil klasifikasi kepada frontend.
    json_response([
        'success' => true,
        'message' => 'Klasifikasi minat baca berhasil dilakukan menggunakan algoritma KNN.',
        'data' => [
            'status' => 'predicted',
            'prediction' => $knnResult['prediction'],
            'method' => $method,

            'member_profile' => [
                'study_program' => $currentStudyProgram,
                'total_borrowings' => (int) $currentMember['total_borrowings'],
                'categorized_borrowings' => $categorizedBorrowings,
                'borrow_counts' => $currentBorrowCounts,
            ],

            'category_statistics' => $categoryStatistics,

            'training_class_distribution' => array_combine(
                array_map(
                    static fn (string $key): string =>
                        $categoryLabels[$key],
                    $featureKeys
                ),
                array_map(
                    static fn (string $key): int =>
                        $trainingClassCounts[$key],
                    $featureKeys
                )
            ),

            'vote_counts' => $knnResult['vote_counts'],
            'neighbors' => $knnResult['neighbors'],

            'unmapped_categories' =>
                $currentMember['unmapped_categories'],
        ],
    ]);
} catch (Throwable $exception) {
    handle_server_error($exception);
}