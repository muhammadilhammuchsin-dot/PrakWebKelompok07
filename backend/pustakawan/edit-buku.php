<?php
declare(strict_types=1);
require_once __DIR__ . '/../shared/auth.php';
protect_post_request();
$user = require_role(['pustakawan']);
$data = request_data();
$bookId = request_int($data, ['book_id', 'id']);
$oldCode = request_string($data, ['old_book_code', 'old_id_buku']);
$newCode = strtoupper(request_string($data, ['id_buku', 'book_code', 'code']));
$title = request_string($data, ['judul', 'title']);
$categoryValue = request_string($data, ['kategori', 'category', 'category_id']);
$newAvailableStock = request_int($data, ['stok', 'stock', 'available_stock']);
if (($bookId === null || $bookId < 1) && $oldCode === '') {
    json_response(['success' => false, 'message' => 'ID buku atau kode buku lama wajib diberikan.'], 422);
}
if ($newCode !== '' && !preg_match('/^[A-Z0-9_-]{2,50}$/', $newCode)) {
    json_response(['success' => false, 'message' => 'Format kode buku tidak valid.'], 422);
}
if ($newAvailableStock !== null && $newAvailableStock < 0) {
    json_response(['success' => false, 'message' => 'Stok tersedia tidak boleh negatif.'], 422);
}
$pdo = null;
try {
    $pdo = db();
    $pdo->beginTransaction();
    if ($bookId !== null && $bookId > 0) {
        $find = $pdo->prepare('SELECT * FROM buku WHERE id = :book_id FOR UPDATE');
        $find->execute(['book_id' => $bookId]);
    } else {
        $find = $pdo->prepare('SELECT * FROM buku WHERE book_code = :book_code FOR UPDATE');
        $find->execute(['book_code' => $oldCode]);
    }
    $book = $find->fetch();
    if (!$book) {
        $pdo->rollBack();
        json_response(['success' => false, 'message' => 'Buku yang akan diubah tidak ditemukan.'], 404);
    }
    $bookId = (int) $book['id'];
    $finalCode = $newCode !== '' ? $newCode : (string) $book['book_code'];
    $finalTitle = $title !== '' ? $title : (string) $book['title'];
    $finalCategoryId = $categoryValue !== ''
        ? resolve_category_id($pdo, $categoryValue, true)
        : ($book['category_id'] !== null ? (int) $book['category_id'] : null);
    $borrowedQuery = $pdo->prepare("SELECT COUNT(*) FROM transaksi_peminjaman WHERE book_id = :book_id AND status = 'borrowed'");
    $borrowedQuery->execute(['book_id' => $bookId]);
    $borrowedCount = (int) $borrowedQuery->fetchColumn();
    $oldAvailable = (int) $book['available_stock'];
    $finalAvailable = $newAvailableStock !== null ? $newAvailableStock : $oldAvailable;
    $finalTotal = $finalAvailable + $borrowedCount;
    $update = $pdo->prepare("
        UPDATE buku
        SET book_code = :book_code,
            title = :title,
            category_id = :category_id,
            total_stock = :total_stock,
            available_stock = :available_stock
        WHERE id = :book_id
    ");
    $update->execute([
        'book_code' => $finalCode,
        'title' => $finalTitle,
        'category_id' => $finalCategoryId,
        'total_stock' => $finalTotal,
        'available_stock' => $finalAvailable,
        'book_id' => $bookId,
    ]);
    if ($finalAvailable !== $oldAvailable) {
        $movement = $pdo->prepare("
            INSERT INTO riwayat_perubahan_stok (
                book_id, movement_type, quantity, notes, created_by_user_id
            ) VALUES (
                :book_id, 'ADJUSTMENT', :quantity, :notes, :created_by_user_id
            )
        ");
        $movement->execute([
            'book_id' => $bookId,
            'quantity' => abs($finalAvailable - $oldAvailable),
            'notes' => $finalAvailable > $oldAvailable
                ? 'Penambahan stok tersedia oleh pustakawan.'
                : 'Pengurangan stok tersedia oleh pustakawan.',
            'created_by_user_id' => (int) $user['id'],
        ]);
    }
    $pdo->commit();
    json_response([
        'success' => true,
        'message' => 'Data buku berhasil diperbarui.',
        'data' => [
            'id' => $bookId,
            'id_buku' => $finalCode,
            'book_code' => $finalCode,
            'judul' => $finalTitle,
            'title' => $finalTitle,
            'stok' => $finalAvailable,
            'available_stock' => $finalAvailable,
            'total_stock' => $finalTotal,
        ],
    ]);
} catch (PDOException $exception) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if (db_driver_error_code($exception) === 1062) {
        json_response(['success' => false, 'message' => 'Kode buku sudah digunakan oleh buku lain.'], 409);
    }
    handle_server_error($exception);
} catch (Throwable $exception) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ($exception instanceof InvalidArgumentException) {
        json_response(['success' => false, 'message' => $exception->getMessage()], 422);
    }
    handle_server_error($exception);
}
