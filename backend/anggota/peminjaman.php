<?php
// Mengelola permintaan peminjaman buku oleh anggota.

require_once __DIR__ . '/../shared/auth.php';
$user = require_role(['anggota']);
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
function eperpus_has_trigger(PDO $pdo, string $triggerName): bool
{
    $query = $pdo->prepare("
        SELECT COUNT(*)
        FROM information_schema.TRIGGERS
        WHERE TRIGGER_SCHEMA = DATABASE()
          AND TRIGGER_NAME = :trigger_name
    ");
    $query->execute([
        'trigger_name' => $triggerName
    ]);
    return (int) $query->fetchColumn() > 0;
}
if ($method === 'GET') {
    try {
        $bookId = filter_var(
            $_GET['book_id'] ?? $_GET['id'] ?? '',
            FILTER_VALIDATE_INT
        );
        if ($bookId === false || $bookId < 1) {
            json_response([
                'success' => false,
                'message' => 'ID buku tidak valid.'
            ], 422);
        }
        $pdo = db();
        $memberId = (int) $user['id'];
        $activeQuery = $pdo->prepare("
            SELECT
                id,
                loan_code,
                book_id,
                loan_date,
                due_date,
                returned_at,
                status
            FROM transaksi_peminjaman
            WHERE member_user_id = :member_id
              AND book_id = :book_id
              AND status = 'borrowed'
            ORDER BY id DESC
            LIMIT 1
        ");
        $activeQuery->execute([
            'member_id' => $memberId,
            'book_id' => (int) $bookId
        ]);
        $activeLoan = $activeQuery->fetch() ?: null;
        $latestQuery = $pdo->prepare("
            SELECT
                id,
                loan_code,
                book_id,
                loan_date,
                due_date,
                returned_at,
                status
            FROM transaksi_peminjaman
            WHERE member_user_id = :member_id
              AND book_id = :book_id
            ORDER BY id DESC
            LIMIT 1
        ");
        $latestQuery->execute([
            'member_id' => $memberId,
            'book_id' => (int) $bookId
        ]);
        $latestLoan = $latestQuery->fetch() ?: null;
        if ($activeLoan !== null) {
            $activeLoan['id'] = (int) $activeLoan['id'];
            $activeLoan['book_id'] = (int) $activeLoan['book_id'];
        }
        if ($latestLoan !== null) {
            $latestLoan['id'] = (int) $latestLoan['id'];
            $latestLoan['book_id'] = (int) $latestLoan['book_id'];
        }
        json_response([
            'success' => true,
            'message' => 'Status peminjaman berhasil diperiksa.',
            'data' => [
                'book_id' => (int) $bookId,
                'has_active_loan' => $activeLoan !== null,
                'active_loan' => $activeLoan,
                'latest_loan' => $latestLoan
            ]
        ]);
    } catch (Throwable $exception) {
        handle_server_error($exception);
    }
}
if ($method === 'POST') {
    protect_post_request();
    $data = request_data();
    $bookId = request_int($data, ['book_id', 'id']);
    if ($bookId === null || $bookId < 1) {
        json_response([
            'success' => false,
            'message' => 'ID buku tidak valid.'
        ], 422);
    }
    $loanDurationDays = 7;
    $pdo = null;
    try {
        $pdo = db();
        $pdo->beginTransaction();
        $memberId = (int) $user['id'];
        $bookQuery = $pdo->prepare("
            SELECT
                id,
                book_code,
                title,
                available_stock,
                book_status
            FROM buku
            WHERE id = :book_id
            FOR UPDATE
        ");
        $bookQuery->execute([
            'book_id' => $bookId
        ]);
        $book = $bookQuery->fetch();
        if (!$book) {
            $pdo->rollBack();
            json_response([
                'success' => false,
                'message' => 'Buku tidak ditemukan.'
            ], 404);
        }
        $activeQuery = $pdo->prepare("
            SELECT
                id,
                loan_code,
                loan_date,
                due_date
            FROM transaksi_peminjaman
            WHERE member_user_id = :member_id
              AND book_id = :book_id
              AND status = 'borrowed'
            ORDER BY id DESC
            LIMIT 1
            FOR UPDATE
        ");
        $activeQuery->execute([
            'member_id' => $memberId,
            'book_id' => $bookId
        ]);
        $activeLoan = $activeQuery->fetch();
        if ($activeLoan) {
            $pdo->rollBack();
            json_response([
                'success' => false,
                'message' => 'Buku ini masih Anda pinjam. Tunggu pustakawan mencatat pengembalian sebelum meminjam lagi.',
                'data' => [
                    'has_active_loan' => true,
                    'active_loan' => $activeLoan
                ]
            ], 409);
        }
        if ($book['book_status'] !== 'active') {
            $pdo->rollBack();
            json_response([
                'success' => false,
                'message' => 'Buku sedang tidak aktif untuk dipinjam.'
            ], 409);
        }
        if ((int) $book['available_stock'] < 1) {
            $pdo->rollBack();
            json_response([
                'success' => false,
                'message' => 'Stok buku sedang habis.'
            ], 409);
        }
        $hasInsertTrigger = eperpus_has_trigger(
            $pdo,
            'trg_transaksi_peminjaman_after_insert'
        );
        $loanCode = generate_loan_code();
        $insert = $pdo->prepare("
            INSERT INTO transaksi_peminjaman (
                loan_code,
                member_user_id,
                book_id,
                loan_date,
                due_date,
                status
            ) VALUES (
                :loan_code,
                :member_id,
                :book_id,
                CURRENT_TIMESTAMP,
                DATE_ADD(
                    CURRENT_DATE,
                    INTERVAL {$loanDurationDays} DAY
                ),
                'borrowed'
            )
        ");
        $insert->execute([
            'loan_code' => $loanCode,
            'member_id' => $memberId,
            'book_id' => $bookId
        ]);
        $loanId = (int) $pdo->lastInsertId();
        if (!$hasInsertTrigger) {
            $stockUpdate = $pdo->prepare("
                UPDATE buku
                SET available_stock = available_stock - 1
                WHERE id = :book_id
                  AND available_stock > 0
            ");
            $stockUpdate->execute([
                'book_id' => $bookId
            ]);
            if ($stockUpdate->rowCount() !== 1) {
                throw new RuntimeException(
                    'Stok buku gagal diperbarui.'
                );
            }
            $history = $pdo->prepare("
                INSERT INTO riwayat_perubahan_stok (
                    book_id,
                    loan_transaction_id,
                    movement_type,
                    quantity,
                    notes
                ) VALUES (
                    :book_id,
                    :transaction_id,
                    'OUT',
                    1,
                    'Stok keluar otomatis karena peminjaman'
                )
            ");
            $history->execute([
                'book_id' => $bookId,
                'transaction_id' => $loanId
            ]);
        }
        $resultQuery = $pdo->prepare("
            SELECT
                t.id,
                t.loan_code,
                t.loan_date,
                t.due_date,
                t.status,
                b.id AS book_id,
                b.book_code,
                b.title,
                b.available_stock
            FROM transaksi_peminjaman t
            INNER JOIN buku b
                ON b.id = t.book_id
            WHERE t.id = :loan_id
            LIMIT 1
        ");
        $resultQuery->execute([
            'loan_id' => $loanId
        ]);
        $result = $resultQuery->fetch();
        if (!$result) {
            throw new RuntimeException(
                'Data transaksi tidak dapat dibaca kembali.'
            );
        }
        $pdo->commit();
        $result['id'] = (int) $result['id'];
        $result['book_id'] = (int) $result['book_id'];
        $result['available_stock'] =
            (int) $result['available_stock'];
        json_response([
            'success' => true,
            'message' => 'Berhasil dipinjam. Transaksi sudah tercatat dan stok tersedia telah diperbarui.',
            'data' => $result
        ], 201);
    } catch (PDOException $exception) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if (db_sql_state($exception) === '45000') {
            json_response([
                'success' => false,
                'message' => 'Peminjaman ditolak karena stok buku tidak tersedia atau tidak valid.'
            ], 409);
        }
        handle_server_error($exception);
    } catch (Throwable $exception) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        handle_server_error($exception);
    }
}
header('Allow: GET, POST');
json_response([
    'success' => false,
    'message' => 'Metode request tidak diizinkan.'
], 405);
