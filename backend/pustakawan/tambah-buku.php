<?php
declare(strict_types=1);
require_once __DIR__ . '/../shared/auth.php';
protect_post_request();
$user = require_role(['pustakawan']);
$data = request_data();
$bookCode = strtoupper(request_string($data, ['id_buku', 'book_code', 'code']));
$title = request_string($data, ['judul', 'title']);
$authorName = request_string($data, ['penulis', 'author']);
$categoryValue = request_string($data, ['kategori', 'category', 'category_id']);
$stock = request_int($data, ['stok', 'stock', 'total_stock']);
$description = request_string($data, ['deskripsi', 'description']);
$isbn = request_string($data, ['isbn']);
$publisher = request_string($data, ['publisher', 'penerbit']);
$publicationYear = request_string($data, ['publication_year', 'tahun_terbit']);
$edition = request_string($data, ['edition', 'edisi']);
$shelfLocation = request_string($data, ['shelf_location', 'lokasi_rak']);
if ($bookCode === '' || $title === '' || $authorName === '' || $categoryValue === '' || $stock === null) {
    json_response(['success' => false, 'message' => 'Kode, judul, penulis, kategori, dan stok wajib diisi.'], 422);
}
if (!preg_match('/^[A-Z0-9_-]{2,50}$/', $bookCode)) {
    json_response(['success' => false, 'message' => 'Kode buku hanya boleh berisi huruf, angka, tanda hubung, dan garis bawah (2–50 karakter).'], 422);
}
if (mb_strlen($title) > 255 || mb_strlen($authorName) > 150 || $stock < 0) {
    json_response(['success' => false, 'message' => 'Judul, penulis, atau stok tidak valid.'], 422);
}
if ($publicationYear !== '') {
    $yearNumber = filter_var($publicationYear, FILTER_VALIDATE_INT);
    if ($yearNumber === false || $yearNumber < 1901 || $yearNumber > 2155) {
        json_response(['success' => false, 'message' => 'Tahun terbit harus berada pada rentang 1901 sampai 2155.'], 422);
    }
}
$coverPath = null;
$pdo = null;
try {
    $pdo = db();
    $coverPath = save_cover_upload('gambar');
    $pdo->beginTransaction();
    $categoryId = resolve_category_id($pdo, $categoryValue, true);
    $authorId = resolve_author_id($pdo, $authorName);
    $insertBook = $pdo->prepare("
        INSERT INTO buku (
            book_code, isbn, title, category_id, publisher, publication_year,
            edition, description, cover_path, shelf_location,
            total_stock, available_stock, book_status
        ) VALUES (
            :book_code, :isbn, :title, :category_id, :publisher, :publication_year,
            :edition, :description, :cover_path, :shelf_location,
            :total_stock, :available_stock, 'active'
        )
    ");
    $insertBook->execute([
        'book_code' => $bookCode,
        'isbn' => $isbn !== '' ? $isbn : null,
        'title' => $title,
        'category_id' => $categoryId,
        'publisher' => $publisher !== '' ? $publisher : null,
        'publication_year' => $publicationYear !== '' ? (int) $publicationYear : null,
        'edition' => $edition !== '' ? $edition : null,
        'description' => $description !== '' ? $description : null,
        'cover_path' => $coverPath,
        'shelf_location' => $shelfLocation !== '' ? $shelfLocation : null,
        'total_stock' => $stock,
        'available_stock' => $stock,
    ]);
    $bookId = (int) $pdo->lastInsertId();
    $linkAuthor = $pdo->prepare('INSERT INTO buku_penulis (book_id, author_id, author_order) VALUES (:book_id, :author_id, 1)');
    $linkAuthor->execute(['book_id' => $bookId, 'author_id' => $authorId]);
    if ($stock > 0) {
        $movement = $pdo->prepare("
            INSERT INTO riwayat_perubahan_stok (
                book_id, movement_type, quantity, notes, created_by_user_id
            ) VALUES (
                :book_id, 'IN', :quantity, :notes, :created_by_user_id
            )
        ");
        $movement->execute([
            'book_id' => $bookId,
            'quantity' => $stock,
            'notes' => 'Stok awal saat buku ditambahkan.',
            'created_by_user_id' => (int) $user['id'],
        ]);
    }
    $pdo->commit();
    json_response([
        'success' => true,
        'message' => 'Buku berhasil ditambahkan.',
        'data' => [
            'id' => $bookId,
            'id_buku' => $bookCode,
            'book_code' => $bookCode,
            'judul' => $title,
            'title' => $title,
            'penulis' => $authorName,
            'kategori' => $categoryValue,
            'stok' => $stock,
            'available_stock' => $stock,
            'cover_path' => $coverPath,
        ],
    ], 201);
} catch (PDOException $exception) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ($coverPath !== null) {
        delete_cover_file($coverPath);
    }
    if (db_driver_error_code($exception) === 1062) {
        json_response(['success' => false, 'message' => 'Kode buku atau ISBN sudah digunakan.'], 409);
    }
    handle_server_error($exception);
} catch (Throwable $exception) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ($coverPath !== null) {
        delete_cover_file($coverPath);
    }
    if ($exception instanceof InvalidArgumentException) {
        json_response(['success' => false, 'message' => $exception->getMessage()], 422);
    }
    handle_server_error($exception);
}
