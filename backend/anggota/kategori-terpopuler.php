<?php

require_once __DIR__ . '/../shared/auth.php';
require_method('GET');
require_role(['anggota']);
try {
    $pdo = db();
    $categoryCase = "

        CASE

            WHEN
                LOWER(k.category_name) LIKE '%informatika%'
                OR LOWER(k.category_name) LIKE '%komputer%'
                OR LOWER(k.category_name) LIKE '%teknologi%'
                OR LOWER(k.category_name) LIKE '%sistem informasi%'

            THEN 'informatika'


            WHEN
                LOWER(k.category_name) LIKE '%sains%'
                OR LOWER(k.category_name) LIKE '%matematika%'

            THEN 'sains'


            WHEN
                LOWER(k.category_name) LIKE '%sastra%'
                OR LOWER(k.category_name) LIKE '%bahasa%'

            THEN 'sastra'

            WHEN
                LOWER(k.category_name) LIKE '%sosial%'
                OR LOWER(k.category_name) LIKE '%bisnis%'
                OR LOWER(k.category_name) LIKE '%ekonomi%'
                OR LOWER(k.category_name) LIKE '%manajemen%'

            THEN 'sosial'
            ELSE NULL
        END

    ";
    $sql = "
        SELECT
            {$categoryCase} AS category_key,
            COUNT(r.id) AS total_activity,
            COUNT(DISTINCT r.member_user_id) AS total_members,
            MAX(r.searched_at) AS latest_activity
        FROM riwayat_pencarian_buku r
        INNER JOIN kategori_buku k
            ON k.id = r.category_id

        WHERE r.category_id IS NOT NULL

        GROUP BY category_key

        HAVING category_key IS NOT NULL

        ORDER BY

            total_activity DESC,

            total_members DESC,

            latest_activity DESC,

            category_key ASC

    ";
    $query = $pdo->query($sql);
    $rows = $query->fetchAll(PDO::FETCH_ASSOC);
    $definitions = [
        'informatika' => [
            'key' => 'informatika',
            'label' => 'Informatika & Komputer',
            'file' => 'cari-informatika.html'
        ],
        'sains' => [
            'key' => 'sains',
            'label' => 'Sains & Matematika',
            'file' => 'cari-sains.html'
        ],
        'sastra' => [
            'key' => 'sastra',
            'label' => 'Sastra & Bahasa',
            'file' => 'cari-sastra.html'
        ],
        'sosial' => [
            'key' => 'sosial',
            'label' => 'Sosial & Bisnis',
            'file' => 'cari-sosial.html'
        ]
    ];
    $statistics = [];
    foreach ($definitions as $key => $definition) {
        $statistics[$key] = $definition + [
            'total_activity' => 0,
            'total_members' => 0,
            'latest_activity' => null,
            'percentage' => 0
        ];
    }
    foreach ($rows as $row) {
        $key = (string) (
            $row['category_key'] ?? ''
        );
        if (!isset($statistics[$key])) {
            continue;
        }
        $statistics[$key]['total_activity'] =
            (int) $row['total_activity'];
        $statistics[$key]['total_members'] =
            (int) $row['total_members'];
        $statistics[$key]['latest_activity'] =
            $row['latest_activity'];
    }
    $totalSearches = 0;
    foreach ($statistics as $category) {
        $totalSearches +=
            $category['total_activity'];
    }
    foreach ($statistics as &$category) {
        if ($totalSearches > 0) {
            $category['percentage'] = round(
                (
                    $category['total_activity'] /
                    $totalSearches
                ) * 100,
                2
            );
        }
    }
    unset($category);
    $categories = array_values($statistics);
    $categoryOrder = array_flip(
        array_keys($definitions)
    );
    usort(
        $categories,
        static function (
            array $a,
            array $b
        ) use ($categoryOrder): int {
            if (
                $a['total_activity'] !==
                $b['total_activity']
            ) {
                return $b['total_activity'] <=>
                    $a['total_activity'];
            }
            if (
                $a['total_members'] !==
                $b['total_members']
            ) {
                return $b['total_members'] <=>
                    $a['total_members'];
            }
            $dateComparison = strcmp(
                (string) ($b['latest_activity'] ?? ''),
                (string) ($a['latest_activity'] ?? '')
            );
            if ($dateComparison !== 0) {
                return $dateComparison;
            }
            return (
                $categoryOrder[$a['key']] ?? 99
            ) <=> (
                $categoryOrder[$b['key']] ?? 99
            );
        }
    );
    $popular = null;
    if (
        isset($categories[0]) &&
        $categories[0]['total_activity'] > 0
    ) {
        $popular = $categories[0];
    }
    json_response([
        'success' => true,
        'message' => $popular
            ? 'Kategori terpopuler berhasil dimuat.'
            : 'Belum ada data pencarian yang memiliki kategori.',
        'data' => [
            'popular' => $popular,
            'categories' => $categories,
            'total_searches' => $totalSearches,
            'scope' => 'all_members',
            'source' => 'riwayat_pencarian_buku'
        ]
    ]);
} catch (Throwable $exception) {
    handle_server_error($exception);
}
