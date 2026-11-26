<?php
declare(strict_types=1);
require_once __DIR__ . '/../shared/auth.php';
protect_post_request();
require_role(['pustakawan']);
$data = request_data();
$bookId = request_int($data, ['book_id', 'id']);
$bookCode = request_string($data, ['book_code', 'id_buku']);
if (($bookId === null || $bookId < 1) && $bookCode === '') {
    json_response(['success' => false, 'message' => 'ID atau kode buku wajib diberikan.'], 422);
}
try {
    $pdo = db();
    if ($bookId !== null && $bookId > 0) {
        $query = $pdo->prepare("UPDATE buku SET book_status = 'inactive' WHERE id = :book_id AND book_status = 'active'");
        $query->execute(['book_id' => $bookId]);
    } else {
        $query = $pdo->prepare("UPDATE buku SET book_status = 'inactive' WHERE book_code = :book_code AND book_status = 'active'");
        $query->execute(['book_code' => $bookCode]);
    }
    if ($query->rowCount() < 1) {
        json_response(['success' => false, 'message' => 'Buku tidak ditemukan atau sudah dinonaktifkan.'], 404);
    }
    json_response([
        'success' => true,
        'message' => 'Buku berhasil dinonaktifkan. Riwayat transaksi tetap dipertahankan.',
    ]);
} catch (Throwable $exception) {
    handle_server_error($exception);
}
