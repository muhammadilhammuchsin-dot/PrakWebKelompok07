<?php
// Memverifikasi OTP dan masa berlaku kode anggota.

require_once __DIR__ . '/../shared/auth.php';
protect_post_request();
$data = request_data();
$role = request_string($data, ['role'], 'anggota');
$otp = request_string($data, ['otp']);
if ($role !== 'anggota') {
    json_response([
        'success' => false,
        'message' => 'Verifikasi OTP hanya tersedia untuk anggota.'
    ], 403);
}
if (!preg_match('/^\d{6}$/', $otp)) {
    json_response([
        'success' => false,
        'message' => 'Kode OTP harus terdiri dari enam angka.'
    ], 422);
}
$flow = $_SESSION['password_reset_flow'] ?? null;
if (
    !is_array($flow) ||
    ($flow['role'] ?? '') !== 'anggota' ||
    empty($flow['user_id']) ||
    empty($flow['token_id'])
) {
    json_response([
        'success' => false,
        'message' => 'Sesi pemulihan tidak ditemukan. Silakan minta OTP baru.'
    ], 419);
}
if (!empty($flow['verified'])) {
    json_response([
        'success' => true,
        'message' => 'OTP sudah diverifikasi. Silakan buat password baru.'
    ]);
}
$pdo = null;
try {
    $pdo = db();
    $query = $pdo->prepare("
        SELECT
            t.id,
            t.user_id,
            t.token_hash,
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
    ");
    $query->execute([
        'token_id' => (int) $flow['token_id'],
        'user_id' => (int) $flow['user_id']
    ]);
    $token = $query->fetch();
    if (
        !$token ||
        $token['used_at'] !== null ||
        (int) $token['is_valid'] !== 1
    ) {
        unset($_SESSION['password_reset_flow']);
        json_response([
            'success' => false,
            'message' => 'OTP sudah kedaluwarsa atau tidak berlaku. Silakan minta kode baru.'
        ], 410);
    }
    $attempts = (int) ($flow['attempts'] ?? 0);
    if ($attempts >= 5) {
        $invalidate = $pdo->prepare("
            UPDATE token_reset_kata_sandi
            SET used_at = NOW()
            WHERE id = :id
              AND used_at IS NULL
        ");
        $invalidate->execute([
            'id' => (int) $token['id']
        ]);
        unset($_SESSION['password_reset_flow']);
        json_response([
            'success' => false,
            'message' => 'Batas percobaan OTP sudah tercapai. Silakan minta OTP baru.'
        ], 429);
    }
    $providedHash = hash('sha256', $otp);
    if (!hash_equals(
        (string) $token['token_hash'],
        $providedHash
    )) {
        $attempts++;
        $_SESSION['password_reset_flow']['attempts'] = $attempts;
        if ($attempts >= 5) {
            $invalidate = $pdo->prepare("
                UPDATE token_reset_kata_sandi
                SET used_at = NOW()
                WHERE id = :id
                  AND used_at IS NULL
            ");
            $invalidate->execute([
                'id' => (int) $token['id']
            ]);
            unset($_SESSION['password_reset_flow']);
            json_response([
                'success' => false,
                'message' => 'OTP salah lima kali. Silakan meminta kode baru.'
            ], 429);
        }
        json_response([
            'success' => false,
            'message' => 'OTP tidak sesuai. Sisa percobaan: ' . (5 - $attempts) . '.'
        ], 422);
    }
    $_SESSION['password_reset_flow']['verified'] = true;
    $_SESSION['password_reset_flow']['verified_at'] = time();
    json_response([
        'success' => true,
        'message' => 'OTP berhasil diverifikasi. Silakan buat password baru.'
    ]);
} catch (Throwable $exception) {
    handle_server_error($exception);
}
