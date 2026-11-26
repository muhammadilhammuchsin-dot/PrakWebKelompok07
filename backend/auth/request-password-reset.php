<?php
// Mengirim OTP pemulihan password khusus anggota.

require_once __DIR__ . '/../shared/auth.php';
protect_post_request();
$data = request_data();
$role = request_string($data, ['role'], 'anggota');
$email = strtolower(request_string($data, ['identity', 'email']));
if ($role !== 'anggota') {
    json_response([
        'success' => false,
        'message' => 'Fitur pemulihan password hanya tersedia untuk anggota.'
    ], 403);
}
if (!valid_email($email)) {
    json_response([
        'success' => false,
        'message' => 'Masukkan alamat email yang valid.'
    ], 422);
}
$pdo = null;
try {
    require_once __DIR__ . '/../shared/mailer.php';
    $pdo = db();
    $query = $pdo->prepare("
        SELECT
            u.id,
            u.email,
            ap.full_name

        FROM akun_pengguna u

        INNER JOIN jenis_pengguna r
            ON r.id = u.role_id

        INNER JOIN profil_anggota ap
            ON ap.user_id = u.id

        WHERE r.role_code = 'anggota'
          AND u.account_status = 'active'
          AND LOWER(u.email) = LOWER(:email)

        LIMIT 1
    ");
    $query->execute([
        'email' => $email
    ]);
    $account = $query->fetch();
    if (!$account) {
        json_response([
            'success' => false,
            'message' => 'Email tidak ditemukan pada akun anggota. Periksa kembali email Anda.'
        ], 404);
    }
    $userId = (int) $account['id'];
    $name = (string) $account['full_name'];
    $rateQuery = $pdo->prepare("
        SELECT COUNT(*)

        FROM token_reset_kata_sandi

        WHERE user_id = :user_id
          AND created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
    ");
    $rateQuery->execute([
        'user_id' => $userId
    ]);
    if ((int) $rateQuery->fetchColumn() >= 3) {
        json_response([
            'success' => false,
            'message' => 'Permintaan OTP terlalu banyak. Silakan coba kembali setelah 15 menit.'
        ], 429);
    }
    $otp = (string) random_int(100000, 999999);
    $tokenHash = hash('sha256', $otp);
    $pdo->beginTransaction();
    $invalidate = $pdo->prepare("
        UPDATE token_reset_kata_sandi

        SET used_at = NOW()

        WHERE user_id = :user_id
          AND used_at IS NULL
    ");
    $invalidate->execute([
        'user_id' => $userId
    ]);
    $insert = $pdo->prepare("
        INSERT INTO token_reset_kata_sandi
        (
            user_id,
            token_hash,
            expires_at
        )

        VALUES
        (
            :user_id,
            :token_hash,
            DATE_ADD(NOW(), INTERVAL 5 MINUTE)
        )
    ");
    $insert->execute([
        'user_id' => $userId,
        'token_hash' => $tokenHash
    ]);
    $tokenId = (int) $pdo->lastInsertId();
    $pdo->commit();
    $safeName = htmlspecialchars(
        $name,
        ENT_QUOTES | ENT_SUBSTITUTE,
        'UTF-8'
    );
    $safeOtp = htmlspecialchars(
        $otp,
        ENT_QUOTES | ENT_SUBSTITUTE,
        'UTF-8'
    );
    $subject = 'Kode OTP Pemulihan Password E-Perpustakaan';
    $textBody = "
Halo {$name},

Kode OTP pemulihan password Anda adalah:

{$otp}

Kode berlaku selama 5 menit dan hanya dapat digunakan satu kali.

Jangan berikan kode OTP kepada siapa pun.

Jika Anda tidak meminta pemulihan password, abaikan email ini.

E-Perpustakaan.
";
    $htmlBody = '
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
    </head>
    <body style="font-family:Arial,sans-serif;color:#172033;line-height:1.6;">

        <h2 style="color:#173b75;">E-Perpustakaan</h2>

        <p>Halo ' . $safeName . ',</p>

        <p>
            Gunakan kode berikut untuk memulihkan password akun Anda:
        </p>

        <div style="
            font-size:30px;
            font-weight:bold;
            letter-spacing:8px;
            padding:16px;
            background:#eef4ff;
            border-radius:8px;
            display:inline-block;
        ">
            ' . $safeOtp . '
        </div>

        <p>
            Kode berlaku selama <strong>5 menit</strong>.
        </p>

        <p>
            Jangan berikan kode OTP kepada siapa pun.
        </p>

        <p>
            Jika Anda tidak meminta pemulihan password,
            abaikan email ini.
        </p>

        <p>E-Perpustakaan.</p>

    </body>
    </html>
    ';
    try {
        $mailConfig = require __DIR__ . '/../config/mail.php';
        send_password_reset_email(
            $mailConfig,
            (string) $account['email'],
            $name,
            $subject,
            $textBody,
            $htmlBody
        );
    } catch (Throwable $mailError) {
        $invalidateFailed = $pdo->prepare("
            UPDATE token_reset_kata_sandi

            SET used_at = NOW()

            WHERE id = :id
              AND user_id = :user_id
              AND used_at IS NULL
        ");
        $invalidateFailed->execute([
            'id' => $tokenId,
            'user_id' => $userId
        ]);
        error_log(
            '[SMTP OTP ANGGOTA] ' . $mailError->getMessage()
        );
        unset($_SESSION['password_reset_flow']);
        json_response([
            'success' => false,
            'message' => 'Email OTP gagal dikirim. Periksa konfigurasi SMTP dan koneksi internet.'
        ], 503);
    }
    $_SESSION['password_reset_flow'] = [
        'user_id' => $userId,
        'role' => 'anggota',
        'token_id' => $tokenId,
        'attempts' => 0,
        'verified' => false,
        'requested_at' => time()
    ];
    [$local, $domain] = explode(
        '@',
        (string) $account['email'],
        2
    );
    $maskedEmail =
        substr($local, 0, 1) .
        str_repeat('*', max(2, strlen($local) - 1)) .
        '@' . $domain;
    json_response([
        'success' => true,
        'message' => 'Kode OTP berhasil dikirim ke email Anda.',
        'destination' => $maskedEmail,
        'expires_in' => 300
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
