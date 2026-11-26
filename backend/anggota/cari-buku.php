<?php
// Menangani pencarian katalog, filter kategori, dan pagination.

require_once __DIR__ . '/../shared/auth.php';
require_method('GET');
$user = require_role(['anggota']);
try {
    $pdo = db();
    $keyword = trim(
        (string) ($_GET['keyword'] ?? $_GET['q'] ?? '')
    );
    $keyword = function_exists('mb_substr')
        ? mb_substr($keyword, 0, 255, 'UTF-8')
        : substr($keyword, 0, 255);
    $categoryId = null;
    if (
        isset($_GET['category_id']) &&
        $_GET['category_id'] !== ''
    ) {
        $validatedCategory = filter_var(
            $_GET['category_id'],
            FILTER_VALIDATE_INT
        );
        if (
            $validatedCategory === false ||
            $validatedCategory < 1
        ) {
            json_response([
                'success' => false,
                'message' => 'ID kategori tidak valid.'
            ], 422);
        }
        $categoryId = (int) $validatedCategory;
        $checkCategory = $pdo->prepare(
            'SELECT id
             FROM kategori_buku
             WHERE id = :category_id
             LIMIT 1'
        );
        $checkCategory->execute([
            'category_id' => $categoryId
        ]);
        if ($checkCategory->fetchColumn() === false) {
            json_response([
                'success' => false,
                'message' => 'Kategori buku tidak ditemukan.'
            ], 404);
        }
    }
    elseif (
        isset($_GET['kategori']) &&
        trim((string) $_GET['kategori']) !== ''
    ) {
        $categoryName = trim(
            (string) $_GET['kategori']
        );
        $categoryAliases = [
            'Teknologi & Informatika' => 'Informatika & Komputer',
            'Teknologi dan Informatika' => 'Informatika & Komputer'
        ];
        $categoryName =
            $categoryAliases[$categoryName] ?? $categoryName;
        $categoryQuery = $pdo->prepare(
            'SELECT id
             FROM kategori_buku
             WHERE category_name = :category_name
             LIMIT 1'
        );
        $categoryQuery->execute([
            'category_name' => $categoryName
        ]);
        $foundCategory = $categoryQuery->fetchColumn();
        if ($foundCategory === false) {
            json_response([
                'success' => false,
                'message' => 'Kategori buku tidak ditemukan: ' . $categoryName
            ], 404);
        }
        $categoryId = (int) $foundCategory;
    }
    $page = max(
        1,
        (int) ($_GET['page'] ?? 1)
    );
    $limit = min(
        50,
        max(1, (int) ($_GET['limit'] ?? 12))
    );
    $offset = ($page - 1) * $limit;
    $conditions = [
        "b.book_status = 'active'"
    ];
    $parameters = [];
    if ($keyword !== '') {
        $conditions[] = "(
            b.title LIKE :keyword_title
            OR b.book_code LIKE :keyword_code
            OR b.isbn LIKE :keyword_isbn

            OR EXISTS (
                SELECT 1
                FROM buku_penulis bp_search

                INNER JOIN penulis_buku pb_search
                    ON pb_search.id = bp_search.author_id

                WHERE bp_search.book_id = b.id

                AND pb_search.author_name LIKE :keyword_author
            )
        )";
        $like = '%' . $keyword . '%';
        $parameters['keyword_title'] = $like;
        $parameters['keyword_code'] = $like;
        $parameters['keyword_isbn'] = $like;
        $parameters['keyword_author'] = $like;
    }
    if ($categoryId !== null) {
        $conditions[] = 'b.category_id = :category_id';
        $parameters['category_id'] = $categoryId;
    }
    $whereSql = implode(' AND ', $conditions);
    $countQuery = $pdo->prepare(
        "SELECT COUNT(*)
         FROM buku b
         WHERE {$whereSql}"
    );
    foreach ($parameters as $key => $value) {
        $countQuery->bindValue(
            ':' . $key,
            $value,
            $key === 'category_id'
                ? PDO::PARAM_INT
                : PDO::PARAM_STR
        );
    }
    $countQuery->execute();
    $total = (int) $countQuery->fetchColumn();
    $sql = "

        SELECT

            b.id,
            b.book_code,
            b.isbn,
            b.title,
            b.category_id,
            k.category_name,
            b.publisher,
            b.publication_year,
            b.edition,
            b.description,
            b.cover_path,
            b.shelf_location,
            b.total_stock,
            b.available_stock,
            b.book_status,
            b.created_at,

            COALESCE((
                SELECT COUNT(*)
                FROM transaksi_peminjaman tp
                WHERE tp.book_id = b.id
            ), 0) AS borrow_count,

            COALESCE((
                SELECT GROUP_CONCAT(
                    pb.author_name
                    ORDER BY bp.author_order
                    SEPARATOR ', '
                )

                FROM buku_penulis bp

                INNER JOIN penulis_buku pb
                    ON pb.id = bp.author_id

                WHERE bp.book_id = b.id

            ), '') AS authors

        FROM buku b

        LEFT JOIN kategori_buku k
            ON k.id = b.category_id

        WHERE {$whereSql}

        ORDER BY b.title ASC

        LIMIT :limit OFFSET :offset

    ";
    $query = $pdo->prepare($sql);
    foreach ($parameters as $key => $value) {
        $query->bindValue(
            ':' . $key,
            $value,
            $key === 'category_id'
                ? PDO::PARAM_INT
                : PDO::PARAM_STR
        );
    }
    $query->bindValue(
        ':limit',
        $limit,
        PDO::PARAM_INT
    );
    $query->bindValue(
        ':offset',
        $offset,
        PDO::PARAM_INT
    );
    $query->execute();
    $books = $query->fetchAll();
    foreach ($books as &$book) {
        $book['id'] = (int) $book['id'];
        $book['category_id'] =
            $book['category_id'] !== null
                ? (int) $book['category_id']
                : null;
        $book['total_stock'] =
            (int) $book['total_stock'];
        $book['available_stock'] =
            (int) $book['available_stock'];
        $book['borrow_count'] =
            (int) $book['borrow_count'];
        $book['jumlah_dipinjam'] =
            $book['borrow_count'];
        $book['id_buku'] = $book['book_code'];
        $book['judul'] = $book['title'];
        $book['kategori'] =
            $book['category_name'] ?? 'Belum dikategorikan';
        $book['penulis'] = $book['authors'];
        $book['stok'] = $book['available_stock'];
        $book['deskripsi'] = $book['description'];
        $book['gambar'] = $book['cover_path'];
    }
    unset($book);
    if (
        $page === 1 &&
        $total > 0 &&
        ($keyword !== '' || $categoryId !== null)
    ) {
        try {
            $selectedHistoryCategoryId = null;
            if ($categoryId !== null) {
                $selectedHistoryCategoryId = $categoryId;
            }
            elseif ($keyword !== '') {
                $historyCategorySql = "
                    SELECT
                        b.category_id,
                        COUNT(*) AS matched_books
                    FROM buku b
                    WHERE {$whereSql}
                      AND b.category_id IS NOT NULL
                    GROUP BY b.category_id
                    ORDER BY
                        matched_books DESC,
                        b.category_id ASC
                    LIMIT 1
                ";
                $historyCategoryQuery = $pdo->prepare(
                    $historyCategorySql
                );
                foreach ($parameters as $key => $value) {
                    $historyCategoryQuery->bindValue(
                        ':' . $key,
                        $value,
                        $key === 'category_id'
                            ? PDO::PARAM_INT
                            : PDO::PARAM_STR
                    );
                }
                $historyCategoryQuery->execute();
                $selectedHistoryCategoryId =
                    $historyCategoryQuery->fetchColumn();
                if ($selectedHistoryCategoryId !== false) {
                    $selectedHistoryCategoryId =
                        (int) $selectedHistoryCategoryId;
                } else {
                    $selectedHistoryCategoryId = null;
                }
            }
            if (
                $selectedHistoryCategoryId !== null &&
                $selectedHistoryCategoryId > 0
            ) {
                $history = $pdo->prepare("
                    INSERT INTO riwayat_pencarian_buku
                    (
                        member_user_id,
                        keyword,
                        category_id
                    )
                    VALUES
                    (
                        :member_user_id,
                        :keyword,
                        :category_id
                    )
                ");
                $history->execute([
                    'member_user_id' => (int) $user['id'],
                    'keyword' => $keyword,
                    'category_id' => (int) $selectedHistoryCategoryId
                ]);
            }
        } catch (Throwable $historyException) {
            error_log(
                '[E-Perpustakaan] Riwayat pencarian gagal disimpan: ' .
                $historyException->getMessage()
            );
        }
    }
    $categoryQuery = $pdo->query("

        SELECT
            id,
            category_name,
            description

        FROM kategori_buku

        ORDER BY category_name ASC

    ");
    $categories = $categoryQuery->fetchAll();
    json_response([
        'success' => true,
        'message' => 'Katalog buku berhasil dimuat.',
        'data' => $books,
        'categories' => $categories,
        'pagination' => [
            'current_page' => $page,
            'per_page' => $limit,
            'total_data' => $total,
            'total_pages' => (int) ceil($total / $limit),
        ],
    ]);
} catch (Throwable $exception) {
    handle_server_error($exception);
}
