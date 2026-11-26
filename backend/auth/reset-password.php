<?php
// Menyimpan password baru setelah OTP anggota valid.

require_once __DIR__ . '/../shared/auth.php';
protect_post_request();
$data = request_data();
$password = isset($data['password']) && is_string($data['password'])
    ? $data['password']
    : '';
$passwordConfirm = isset($data['passwordConfirm']) && is_string($data['passwordConfirm'])
    ? $data['passwordConfirm']
    : '';
if (strlen($password) < 8 || strlen($password) > 100) {
    json_response([
        'success' => false,
        'message' => 'Password harus terdiri dari 8 sampai 100 karakter.'
    ], 422);
}
if (!hash_equals($password, $passwordConfirm)) {
    json_response([
        'success' => false,
        'message' => 'Konfirmasi password tidak sama.'
    ], 422);
}
$flow = $_SESSION['password_reset_flow'] ?? null;
if (
    !is_array($flow) ||
    ($flow['role'] ?? '') !== 'anggota' ||
    empty($flow['verified']) ||
    empty($flow['user_id']) ||
    empty($flow['token_id']) ||
    empty($flow['verified_at']) ||
    (time() - (int) $flow['verified_at']) > 300
) {
    unset($_SESSION['password_reset_flow']);
    json_response([
        'success' => false,
        'message' => 'Verifikasi OTP tidak tersedia atau sudah kedaluwarsa. Silakan ulangi pemulihan password.'
    ], 419);
}
$pdo = null;
try {
    $pdo = db();
    $pdo->beginTransaction();
    $tokenQuery = $pdo->prepare("
        SELECT
            t.id,
            t.user_id,
            t.expires_at,
            t.used_at,
            (t.expires_at > NOW()) AS is_valid

        FROM token_reset_kata_sandi t

        INNER JOIN akun_pengguna u
            ON u.id = t.user_id

        INNER JOIN jenis_pengguna r
            ON r.id = u.role_id

        WHERE t.id = :token_id
          AND t.user_id = :user_id
          AND r.role_code = 'anggota'
          AND u.account_status = 'active'

        LIMIT 1

        FOR UPDATE
    ");
    $tokenQuery->execute([
        'token_id' => (int) $flow['token_id'],
        'user_id' => (int) $flow['user_id']
    ]);
    $token = $tokenQuery->fetch();
    if (
        !$token ||
        $token['used_at'] !== null ||
        (int) $token['is_valid'] !== 1
    ) {
        $pdo->rollBack();
        unset($_SESSION['password_reset_flow']);
        json_response([
            'success' => false,
            'message' => 'OTP sudah kedaluwarsa atau telah digunakan.'
        ], 410);
    }
    $passwordHash = password_hash(
        $password,
        PASSWORD_DEFAULT
    );
    if ($passwordHash === false) {
        throw new RuntimeException(
            'Password gagal diproses.'
        );
    }
    $updateAccount = $pdo->prepare("
        UPDATE akun_pengguna u

        INNER JOIN jenis_pengguna r
            ON r.id = u.role_id

        SET
            u.password_hash = :password_hash,
            u.updated_at = CURRENT_TIMESTAMP

        WHERE u.id = :user_id
          AND r.role_code = 'anggota'
          AND u.account_status = 'active'
    ");
    $updateAccount->execute([
        'password_hash' => $passwordHash,
        'user_id' => (int) $flow['user_id']
    ]);
    if ($updateAccount->rowCount() !== 1) {
        throw new RuntimeException(
            'Password akun anggota gagal diperbarui.'
        );
    }
    $consumeTokens = $pdo->prepare("
        UPDATE token_reset_kata_sandi

        SET used_at = NOW()

        WHERE user_id = :user_id
          AND used_at IS NULL
    ");
    $consumeTokens->execute([
        'user_id' => (int) $flow['user_id']
    ]);
    $pdo->commit();
    unset($_SESSION['password_reset_flow']);
    json_response([
        'success' => true,
        'message' => 'Password berhasil diperbarui. Silakan login menggunakan password baru.'
    ]);
} catch (Throwable $exception) {
    if (
        $pdo instanceof PDO &&
        $pdo->inTransaction()
    ) {
        $pdo->rollBack();
    }
    handle_server_error($exception);
}
