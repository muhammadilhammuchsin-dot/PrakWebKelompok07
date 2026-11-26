<?php
declare(strict_types=1);

// Menyediakan fungsi perhitungan K-Nearest Neighbor untuk klasifikasi minat baca.

/**
 * Menormalkan teks program studi agar perbandingan kategori konsisten.
 */
function eperpus_knn_normalize_program(?string $program): string
{
    $value = trim((string) $program);
    $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

    return function_exists('mb_strtolower')
        ? mb_strtolower($value, 'UTF-8')
        : strtolower($value);
}

/**
 * Menghitung batas minimum dan maksimum fitur jumlah peminjaman dari data latih.
 */
function eperpus_knn_min_max(array $trainingData, array $featureKeys): array
{
    $bounds = [];

    foreach ($featureKeys as $key) {
        $values = array_map(
            static fn (array $sample): float => (float) ($sample['borrow_counts'][$key] ?? 0),
            $trainingData
        );

        $bounds[$key] = [
            'min' => $values === [] ? 0.0 : min($values),
            'max' => $values === [] ? 0.0 : max($values),
        ];
    }

    return $bounds;
}

/**
 * Menghitung Euclidean Distance dari fitur program studi
 * dan fitur jumlah peminjaman yang telah dinormalisasi.
 */
function eperpus_knn_euclidean_distance(
    array $left,
    array $right,
    array $bounds,
    array $featureKeys
): float {
    $leftProgram = eperpus_knn_normalize_program(
        isset($left['study_program']) ? (string) $left['study_program'] : null
    );

    $rightProgram = eperpus_knn_normalize_program(
        isset($right['study_program']) ? (string) $right['study_program'] : null
    );

    // One-Hot Encoding: prodi sama = 0, prodi berbeda = sqrt(2).
    $distanceSquared = $leftProgram === $rightProgram ? 0.0 : 2.0;

    foreach ($featureKeys as $key) {
        $minimum = (float) ($bounds[$key]['min'] ?? 0.0);
        $maximum = (float) ($bounds[$key]['max'] ?? 0.0);
        $range = $maximum - $minimum;

        $leftValue = (float) ($left['borrow_counts'][$key] ?? 0);
        $rightValue = (float) ($right['borrow_counts'][$key] ?? 0);

        // Min-Max Scaling.
        $leftScaled = $range > 0.0
            ? ($leftValue - $minimum) / $range
            : 0.0;

        $rightScaled = $range > 0.0
            ? ($rightValue - $minimum) / $range
            : 0.0;

        $difference = $leftScaled - $rightScaled;
        $distanceSquared += $difference * $difference;
    }

    return sqrt(max(0.0, $distanceSquared));
}

/**
 * Melakukan klasifikasi KNN menggunakan Euclidean Distance
 * dan Majority Voting.
 */
function eperpus_knn_predict(
    array $target,
    array $trainingData,
    array $categoryLabels,
    array $featureKeys,
    int $requestedK
): array {
    if ($trainingData === []) {
        throw new InvalidArgumentException(
            'Data latih KNN belum tersedia.'
        );
    }

    if ($requestedK < 1) {
        throw new InvalidArgumentException(
            'Nilai K harus lebih besar dari nol.'
        );
    }

    $bounds = eperpus_knn_min_max(
        $trainingData,
        $featureKeys
    );

    $neighbors = [];

    // Menghitung jarak setiap data latih terhadap data target.
    foreach ($trainingData as $sample) {
        $labelKey = (string) ($sample['label_key'] ?? '');

        if (!array_key_exists($labelKey, $categoryLabels)) {
            continue;
        }

        $neighbors[] = [
            'user_id' => (int) ($sample['user_id'] ?? 0),
            'label_key' => $labelKey,
            'distance' => eperpus_knn_euclidean_distance(
                $target,
                $sample,
                $bounds,
                $featureKeys
            ),
        ];
    }

    if ($neighbors === []) {
        throw new InvalidArgumentException(
            'Tidak ada data latih dengan label yang valid.'
        );
    }

    // Mengurutkan tetangga berdasarkan jarak terdekat.
    usort(
        $neighbors,
        static function (array $a, array $b): int {
            $distanceOrder = $a['distance'] <=> $b['distance'];

            return $distanceOrder !== 0
                ? $distanceOrder
                : ($a['user_id'] <=> $b['user_id']);
        }
    );

    // Mengambil sembilan tetangga terdekat.
    $effectiveK = min($requestedK, count($neighbors));

    $selectedNeighbors = array_slice(
        $neighbors,
        0,
        $effectiveK
    );

    // Menyiapkan perhitungan suara setiap kategori.
    $voteCounts = array_fill_keys(
        array_keys($categoryLabels),
        0
    );

    $distanceTotals = array_fill_keys(
        array_keys($categoryLabels),
        0.0
    );

    $nearestDistances = array_fill_keys(
        array_keys($categoryLabels),
        INF
    );

    // Melakukan Majority Voting.
    foreach ($selectedNeighbors as $neighbor) {
        $labelKey = $neighbor['label_key'];

        $voteCounts[$labelKey]++;

        $distanceTotals[$labelKey] +=
            $neighbor['distance'];

        $nearestDistances[$labelKey] = min(
            $nearestDistances[$labelKey],
            $neighbor['distance']
        );
    }

    // Menentukan kategori dengan suara terbanyak.
    $highestVotes = max($voteCounts);

    $candidates = array_keys(
        array_filter(
            $voteCounts,
            static fn (int $votes): bool =>
                $votes === $highestVotes
        )
    );

    $tieBreakApplied = count($candidates) > 1;

    // Jika suara seri, gunakan total jarak terkecil.
    if ($tieBreakApplied) {
        $categoryOrder = array_flip(
            array_keys($categoryLabels)
        );

        usort(
            $candidates,
            static function (string $a, string $b) use (
                $distanceTotals,
                $nearestDistances,
                $categoryOrder
            ): int {
                $totalDistanceOrder =
                    $distanceTotals[$a] <=> $distanceTotals[$b];

                if ($totalDistanceOrder !== 0) {
                    return $totalDistanceOrder;
                }

                $nearestDistanceOrder =
                    $nearestDistances[$a] <=> $nearestDistances[$b];

                if ($nearestDistanceOrder !== 0) {
                    return $nearestDistanceOrder;
                }

                return $categoryOrder[$a] <=> $categoryOrder[$b];
            }
        );
    }

    $winningKey = $candidates[0];

    // Menyiapkan informasi sembilan tetangga terdekat.
    $publicNeighbors = [];

    foreach ($selectedNeighbors as $index => $neighbor) {
        $publicNeighbors[] = [
            'rank' => $index + 1,
            'label' => $categoryLabels[$neighbor['label_key']],
            'distance' => round($neighbor['distance'], 6),
        ];
    }

    // Menyiapkan hasil voting seluruh kategori.
    $publicVotes = [];

    foreach ($voteCounts as $key => $votes) {
        $publicVotes[$categoryLabels[$key]] = $votes;
    }

    return [
        'prediction' => [
            'key' => $winningKey,
            'label' => $categoryLabels[$winningKey],
            'votes' => $voteCounts[$winningKey],
            'vote_percentage' => round(
                ($voteCounts[$winningKey] / $effectiveK) * 100,
                2
            ),
        ],
        'k_requested' => $requestedK,
        'k_used' => $effectiveK,
        'training_data_size' => count($neighbors),
        'vote_counts' => $publicVotes,
        'tie_break_applied' => $tieBreakApplied,
        'neighbors' => $publicNeighbors,
    ];
}