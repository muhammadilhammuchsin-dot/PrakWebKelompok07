<?php

require_once __DIR__ . '/../shared/auth.php';
require_method('GET');
require_role(['pustakawan']);
try {
    $pdo = db();
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
            b.updated_at,

            COALESCE((
                SELECT GROUP_CONCAT(
                    pb.author_name
                    ORDER BY bp.author_order ASC
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

        WHERE b.book_status = 'active'

        ORDER BY b.created_at DESC, b.id DESC
    ";
    $books = $pdo->query($sql)->fetchAll();
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
        $book['id_buku'] = $book['book_code'];
        $book['judul'] = $book['title'];
        $book['penulis'] = $book['authors'];
        $book['kategori'] =
            $book['category_name'] ?? 'Belum dikategorikan';
        $book['stok'] = $book['available_stock'];
        $book['deskripsi'] =
            $book['description'] ?? '';
        $book['gambar'] =
            $book['cover_path'] ?? '';
    }
    unset($book);
    json_response([
        'success' => true,
        'message' => 'Daftar buku berhasil dimuat.',
        'data' => $books,
        'total' => count($books)
    ]);
} catch (Throwable $exception) {
    handle_server_error($exception);
}
