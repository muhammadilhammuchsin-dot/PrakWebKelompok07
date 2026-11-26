<?php
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;

// Cari Composer Autoload dari root proyek hingga direktori induk jika folder proyek bertingkat.
$projectRoot = dirname(__DIR__, 2);
$autoloadPath = null;
$checkedPaths = [];
for ($level = 0; $level < 4; $level++) {
    $candidate = $projectRoot . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';
    $checkedPaths[] = $candidate;
    if (is_file($candidate) && is_readable($candidate)) {
        $autoloadPath = $candidate;
        break;
    }
    $parentDirectory = dirname($projectRoot);
    if ($parentDirectory === $projectRoot) break;
    $projectRoot = $parentDirectory;
}
if ($autoloadPath === null) {
    throw new RuntimeException('Composer autoload tidak ditemukan atau tidak dapat dibaca. Pastikan vendor/autoload.php tersedia. Lokasi yang diperiksa: ' . implode(' | ', $checkedPaths));
}
require_once $autoloadPath;
if (!class_exists(PHPMailer::class)) {
    throw new RuntimeException('Composer autoload ditemukan, tetapi PHPMailer tidak tersedia. Jalankan composer install pada root proyek.');
}
function send_password_reset_email(
    array $config,
    string $toEmail,
    string $toName,
    string $subject,
    string $textBody,
    string $htmlBody
): void {
    $required = [
        'host',
        'port',
        'username',
        'password',
        'from_email',
        'from_name'
    ];
    foreach ($required as $key) {
        if (empty($config[$key])) {
            throw new RuntimeException(
                'Konfigurasi SMTP belum lengkap: ' . $key
            );
        }
    }
    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host = $config['host'];
        $mail->SMTPAuth = true;
        $mail->Username = $config['username'];
        $mail->Password = $config['password'];
        $mail->Port = (int) $config['port'];
        $mail->CharSet = 'UTF-8';
        $mail->Timeout = 20;
        $mail->SMTPDebug = SMTP::DEBUG_OFF;
        if (($config['encryption'] ?? 'tls') === 'ssl') {
            $mail->SMTPSecure =
                PHPMailer::ENCRYPTION_SMTPS;
        } else {
            $mail->SMTPSecure =
                PHPMailer::ENCRYPTION_STARTTLS;
        }
        $mail->setFrom(
            $config['from_email'],
            $config['from_name']
        );
        $mail->addAddress(
            $toEmail,
            $toName
        );
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body = $htmlBody;
        $mail->AltBody = $textBody;
        $mail->send();
    } catch (Throwable $error) {
        error_log(
            '[E-PERPUS SMTP] ' . $error->getMessage()
        );
        throw new RuntimeException(
            'Email gagal dikirim: ' . $mail->ErrorInfo,
            0,
            $error
        );
    }
}
