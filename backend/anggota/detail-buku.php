<?php

require_once __DIR__ . '/../shared/auth.php';
require_method('GET');
require_role(['anggota']);
try {
    $pdo = db();
    $bookId = $_GET['id'] ?? $_GET['book_id'] ?? null;
    $bookCode = trim(
        (string) ($_GET['book_code'] ?? '')
    );
    if ($bookId !== null && $bookId !== '') {
        $validatedId = filter_var(
            $bookId,
            FILTER_VALIDATE_INT
        );
        if ($validatedId === false || $validatedId < 1) {
            json_response([
                'success' => false,
                'message' => 'ID buku tidak valid.'
            ], 422);
        }
        $condition = 'b.id = :book_id';
        $parameters = [
            'book_id' => (int) $validatedId
        ];
    } elseif ($bookCode !== '') {
        $condition = 'b.book_code = :book_code';
        $parameters = [
            'book_code' => $bookCode
        ];
    } else {
        json_response([
            'success' => false,
            'message' => 'ID buku atau kode buku wajib diberikan.'
        ], 422);
    }
    $query = $pdo->prepare("
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
            b.updated_at

        FROM buku b

        LEFT JOIN kategori_buku k
            ON k.id = b.category_id

        WHERE {$condition}
          AND b.book_status = 'active'

        LIMIT 1
    ");
    $query->execute($parameters);
    $book = $query->fetch();
    if (!$book) {
        json_response([
            'success' => false,
            'message' => 'Buku tidak ditemukan atau tidak aktif.'
        ], 404);
    }
    $authorQuery = $pdo->prepare("
        SELECT
            pb.id,
            pb.author_name,
            bp.author_order

        FROM buku_penulis bp

        INNER JOIN penulis_buku pb
            ON pb.id = bp.author_id

        WHERE bp.book_id = :book_id

        ORDER BY bp.author_order ASC
    ");
    $authorQuery->execute([
        'book_id' => (int) $book['id']
    ]);
    $authors = $authorQuery->fetchAll();
    $borrowCount = 0;
    try {
        $borrowQuery = $pdo->prepare("
            SELECT COUNT(*)
            FROM transaksi_peminjaman
            WHERE book_id = :book_id
        ");
        $borrowQuery->execute([
            'book_id' => (int) $book['id']
        ]);
        $borrowCount = (int) $borrowQuery->fetchColumn();
    } catch (Throwable $countError) {
        error_log(
            'Gagal menghitung peminjaman buku: ' .
            $countError->getMessage()
        );
    }
    $book['id'] = (int) $book['id'];
    $book['total_stock'] = (int) $book['total_stock'];
    $book['available_stock'] = (int) $book['available_stock'];
    $book['borrow_count'] = $borrowCount;
    $book['jumlah_dipinjam'] = $borrowCount;
    $book['availability'] =
        $book['available_stock'] > 0
            ? 'tersedia'
            : 'habis';
    $book['id_buku'] = $book['book_code'];
    $book['judul'] = $book['title'];
    $book['kategori'] =
        $book['category_name'] ?? 'Belum dikategorikan';
    $book['penulis'] = implode(
        ', ',
        array_column($authors, 'author_name')
    );
    $book['stok'] = $book['available_stock'];
    $book['deskripsi'] = $book['description'];
    $book['gambar'] = $book['cover_path'];
    json_response([
        'success' => true,
        'message' => 'Detail buku berhasil dimuat.',
        'data' => [
            'book' => $book,
            'authors' => $authors
        ]
    ]);
} catch (Throwable $exception) {
    handle_server_error($exception);
}
