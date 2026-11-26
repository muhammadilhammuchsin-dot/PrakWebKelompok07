<?php
// Mengelola proses peminjaman dan pengembalian buku.

require_once __DIR__ . '/../shared/auth.php';
require_role(['pustakawan']);
$method = strtoupper(
    (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')
);
if ($method === 'GET') {
    try {
        $pdo = db();
        $keyword = trim(
            (string) ($_GET['keyword'] ?? $_GET['q'] ?? '')
        );
        $status = strtolower(
            trim((string) ($_GET['status'] ?? ''))
        );
        $page = max(
            1,
            (int) ($_GET['page'] ?? 1)
        );
        $limit = min(
            100,
            max(1, (int) ($_GET['limit'] ?? 25))
        );
        $offset = ($page - 1) * $limit;
        $conditions = ['1 = 1'];
        $parameters = [];
        if ($keyword !== '') {
            $conditions[] = "(
                t.loan_code LIKE :loan_code
                OR a.npm LIKE :npm
                OR a.full_name LIKE :full_name
                OR b.title LIKE :title
                OR b.book_code LIKE :book_code
            )";
            $like = '%' . $keyword . '%';
            $parameters = [
                'loan_code' => $like,
                'npm' => $like,
                'full_name' => $like,
                'title' => $like,
                'book_code' => $like,
            ];
        }
        if (
            in_array(
                $status,
                ['borrowed', 'returned'],
                true
            )
        ) {
            $conditions[] = 't.status = :status';
            $parameters['status'] = $status;
        }
        $whereSql = implode(
            ' AND ',
            $conditions
        );
        $baseJoins = "
            FROM transaksi_peminjaman t

            INNER JOIN profil_anggota a
                ON a.user_id = t.member_user_id

            INNER JOIN akun_pengguna u
                ON u.id = a.user_id

            INNER JOIN buku b
                ON b.id = t.book_id
        ";
        $count = $pdo->prepare("
            SELECT COUNT(*)

            {$baseJoins}

            WHERE {$whereSql}
        ");
        foreach ($parameters as $key => $value) {
            $count->bindValue(
                ':' . $key,
                $value,
                PDO::PARAM_STR
            );
        }
        $count->execute();
        $total = (int) $count->fetchColumn();
        $sql = "
            SELECT
                t.id,
                t.loan_code,
                t.member_user_id,
                t.book_id,

                t.loan_date,
                t.due_date,
                t.returned_at,
                t.status,
                t.notes,

                a.npm,
                a.full_name,
                a.study_program,

                b.book_code,
                b.title,

                k.category_name,

                CASE
                    WHEN t.status = 'borrowed'
                         AND t.due_date < CURRENT_DATE
                        THEN 'overdue'

                    WHEN t.status = 'borrowed'
                        THEN 'borrowed'

                    ELSE 'returned'
                END AS display_status

            {$baseJoins}

            LEFT JOIN kategori_buku k
                ON k.id = b.category_id

            WHERE {$whereSql}

            ORDER BY
                t.loan_date DESC,
                t.id DESC

            LIMIT :limit OFFSET :offset
        ";
        $query = $pdo->prepare($sql);
        foreach ($parameters as $key => $value) {
            $query->bindValue(
                ':' . $key,
                $value,
                PDO::PARAM_STR
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
        $transactions = $query->fetchAll();
        foreach ($transactions as &$transaction) {
            $transaction['id'] =
                (int) $transaction['id'];
            $transaction['member_user_id'] =
                (int) $transaction['member_user_id'];
            $transaction['book_id'] =
                (int) $transaction['book_id'];
            $transaction['displayId'] =
                (string) $transaction['book_code'];
            $transaction['npm'] =
                $transaction['npm'];
            $transaction['anggota'] =
                $transaction['full_name'];
            $transaction['prodi'] =
                $transaction['study_program'];
            $transaction['judul'] =
                $transaction['title'];
            $transaction['tanggal'] =
                $transaction['loan_date'];
        }
        unset($transaction);
        json_response([
            'success' => true,
            'data' => $transactions,
            'pagination' => [
                'current_page' => $page,
                'per_page' => $limit,
                'total_data' => $total,
                'total_pages' => (int) ceil(
                    $total / $limit
                ),
            ],
        ]);
    } catch (Throwable $exception) {
        handle_server_error($exception);
    }
}
if ($method === 'POST') {
    protect_post_request();
    $data = request_data();
    $action = strtolower(
        request_string($data, ['action'], 'return')
    );
    $transactionId = request_int(
        $data,
        ['transaction_id', 'loan_id', 'id']
    );
    $loanCode = request_string(
        $data,
        ['loan_code']
    );
    if (
        !in_array(
            $action,
            ['return', 'pengembalian'],
            true
        )
    ) {
        json_response([
            'success' => false,
            'message' => 'Aksi transaksi tidak dikenal.'
        ], 422);
    }
    if (
        ($transactionId === null || $transactionId < 1) &&
        $loanCode === ''
    ) {
        json_response([
            'success' => false,
            'message' => 'ID transaksi atau kode peminjaman wajib diberikan.'
        ], 422);
    }
    $pdo = null;
    try {
        $pdo = db();
        $pdo->beginTransaction();
        if (
            $transactionId !== null &&
            $transactionId > 0
        ) {
            $find = $pdo->prepare("
                SELECT id, status

                FROM transaksi_peminjaman

                WHERE id = :transaction_id

                FOR UPDATE
            ");
            $find->execute([
                'transaction_id' => $transactionId
            ]);
        } else {
            $find = $pdo->prepare("
                SELECT id, status

                FROM transaksi_peminjaman

                WHERE loan_code = :loan_code

                FOR UPDATE
            ");
            $find->execute([
                'loan_code' => $loanCode
            ]);
        }
        $transaction = $find->fetch();
        if (!$transaction) {
            $pdo->rollBack();
            json_response([
                'success' => false,
                'message' => 'Transaksi tidak ditemukan.'
            ], 404);
        }
        if ($transaction['status'] === 'returned') {
            $pdo->rollBack();
            json_response([
                'success' => false,
                'message' => 'Buku pada transaksi ini sudah dikembalikan. Stok tidak diubah kembali.'
            ], 409);
        }
        $update = $pdo->prepare("
            UPDATE transaksi_peminjaman

            SET
                status = 'returned',
                returned_at = CURRENT_TIMESTAMP

            WHERE id = :transaction_id
              AND status = 'borrowed'
        ");
        $update->execute([
            'transaction_id' => (int) $transaction['id']
        ]);
        if ($update->rowCount() !== 1) {
            $pdo->rollBack();
            json_response([
                'success' => false,
                'message' => 'Status transaksi berubah. Muat ulang data dan coba kembali.'
            ], 409);
        }
        $pdo->commit();
        json_response([
            'success' => true,
            'message' =>
                'Pengembalian berhasil dicatat dan stok buku diperbarui otomatis.',
            'data' => [
                'transaction_id' => (int) $transaction['id'],
                'status' => 'returned'
            ],
        ]);
    } catch (PDOException $exception) {
        if (
            $pdo instanceof PDO &&
            $pdo->inTransaction()
        ) {
            $pdo->rollBack();
        }
        if (db_sql_state($exception) === '45000') {
            json_response([
                'success' => false,
                'message' => 'Pengembalian tidak dapat diproses oleh aturan database.'
            ], 409);
        }
        handle_server_error($exception);
    } catch (Throwable $exception) {
        if (
            $pdo instanceof PDO &&
            $pdo->inTransaction()
        ) {
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
