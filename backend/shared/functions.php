<?php
declare(strict_types=1);
// Menyediakan helper validasi, respons JSON, dan utilitas umum.
require_once __DIR__ . '/../config/database.php';
function start_secure_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    if (headers_sent()) {
        throw new RuntimeException('Session tidak dapat dimulai karena header sudah dikirim.');
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('EPERPUSTAKAAN_SESSION');
    $isHttps = isset($_SERVER['HTTPS'])
        && $_SERVER['HTTPS'] !== ''
        && strtolower((string) $_SERVER['HTTPS']) !== 'off';
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $isHttps,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}
function json_response(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    try {
        echo json_encode(
            $payload,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        );
    } catch (JsonException $e) {
        http_response_code(500);
        echo '{"success":false,"message":"Respons server tidak dapat dibuat."}';
    }
    exit;
}
function require_method(string $method): void
{
    $actual = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $expected = strtoupper($method);
    if ($actual !== $expected) {
        header('Allow: ' . $expected);
        json_response([
            'success' => false,
            'message' => 'Metode request tidak diizinkan.',
        ], 405);
    }
}
function request_data(): array
{
    static $cached = null;
    if (is_array($cached)) {
        return $cached;
    }
    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    if (str_contains($contentType, 'application/json')) {
        $raw = file_get_contents('php://input');
        if ($raw === false || trim($raw) === '') {
            $cached = [];
            return $cached;
        }
        try {
            $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            json_response([
                'success' => false,
                'message' => 'Format JSON tidak valid.',
            ], 400);
        }
        if (!is_array($decoded)) {
            json_response([
                'success' => false,
                'message' => 'Isi request harus berupa objek JSON.',
            ], 400);
        }
        $cached = $decoded;
        return $cached;
    }
    $cached = is_array($_POST ?? null) ? $_POST : [];
    return $cached;
}
function request_string(array $data, array $keys, string $default = ''): string
{
    foreach ($keys as $key) {
        if (array_key_exists($key, $data) && is_scalar($data[$key])) {
            return trim((string) $data[$key]);
        }
    }
    return $default;
}
function request_int(array $data, array $keys, ?int $default = null): ?int
{
    foreach ($keys as $key) {
        if (!array_key_exists($key, $data) || $data[$key] === '') {
            continue;
        }
        $value = filter_var($data[$key], FILTER_VALIDATE_INT);
        return $value === false ? null : (int) $value;
    }
    return $default;
}
function valid_email(string $email): bool
{
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}
function valid_password(string $password): bool
{
    return strlen($password) >= 8;
}
function generate_loan_code(): string
{
    return 'PJM-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(5)));
}
function db_driver_error_code(PDOException $exception): int
{
    return (int) ($exception->errorInfo[1] ?? 0);
}
function db_sql_state(PDOException $exception): string
{
    return (string) ($exception->errorInfo[0] ?? $exception->getCode());
}
function resolve_category_id(PDO $pdo, string $categoryValue, bool $createIfMissing = true): int
{
    $categoryValue = trim($categoryValue);
    if ($categoryValue === '') {
        throw new InvalidArgumentException('Kategori buku wajib dipilih.');
    }
    if (ctype_digit($categoryValue)) {
        $query = $pdo->prepare('SELECT id FROM kategori_buku WHERE id = :category_id LIMIT 1');
        $query->execute(['category_id' => (int) $categoryValue]);
        $id = $query->fetchColumn();
        if ($id !== false) {
            return (int) $id;
        }
        throw new InvalidArgumentException('ID kategori buku tidak ditemukan.');
    }
    $aliases = [
        'Teknologi & Informatika' => 'Informatika & Komputer',
        'Teknologi dan Informatika' => 'Informatika & Komputer',
    ];
    $categoryValue = $aliases[$categoryValue] ?? $categoryValue;
    $query = $pdo->prepare('SELECT id FROM kategori_buku WHERE category_name = :category_name LIMIT 1');
    $query->execute(['category_name' => $categoryValue]);
    $id = $query->fetchColumn();
    if ($id !== false) {
        return (int) $id;
    }
    if (!$createIfMissing) {
        throw new InvalidArgumentException('Kategori buku tidak ditemukan.');
    }
    $insert = $pdo->prepare('INSERT INTO kategori_buku (category_name) VALUES (:category_name)');
    $insert->execute(['category_name' => $categoryValue]);
    return (int) $pdo->lastInsertId();
}
function resolve_author_id(PDO $pdo, string $authorName): int
{
    $authorName = trim($authorName);
    if ($authorName === '') {
        throw new InvalidArgumentException('Nama penulis wajib diisi.');
    }
    $query = $pdo->prepare(
        'SELECT id FROM penulis_buku WHERE LOWER(author_name) = LOWER(:author_name) LIMIT 1'
    );
    $query->execute(['author_name' => $authorName]);
    $id = $query->fetchColumn();
    if ($id !== false) {
        return (int) $id;
    }
    $insert = $pdo->prepare('INSERT INTO penulis_buku (author_name) VALUES (:author_name)');
    $insert->execute(['author_name' => $authorName]);
    return (int) $pdo->lastInsertId();
}
function save_cover_upload(string $fieldName = 'gambar', int $maxBytes = 5242880): ?string
{
    if (!isset($_FILES[$fieldName]) || !is_array($_FILES[$fieldName])) {
        return null;
    }
    $file = $_FILES[$fieldName];
    $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    if ($error !== UPLOAD_ERR_OK) {
        throw new RuntimeException('Upload sampul gagal. Silakan pilih file kembali.');
    }
    $size = (int) ($file['size'] ?? 0);
    $temporaryPath = (string) ($file['tmp_name'] ?? '');
    if ($size < 1 || $size > $maxBytes) {
        throw new InvalidArgumentException('Ukuran sampul maksimal 5 MB.');
    }
    if ($temporaryPath === '' || !is_uploaded_file($temporaryPath)) {
        throw new InvalidArgumentException('File sampul tidak valid.');
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($temporaryPath);
    $allowed = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];
    if (!isset($allowed[$mime])) {
        throw new InvalidArgumentException('Format sampul harus JPG, PNG, atau WEBP.');
    }
    $projectRoot = dirname(__DIR__, 2);
    $uploadDirectory = $projectRoot . DIRECTORY_SEPARATOR . 'frontend'
        . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'covers';
    if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0755, true) && !is_dir($uploadDirectory)) {
        throw new RuntimeException('Folder penyimpanan sampul tidak dapat dibuat.');
    }
    $fileName = 'cover_' . bin2hex(random_bytes(12)) . '.' . $allowed[$mime];
    $destination = $uploadDirectory . DIRECTORY_SEPARATOR . $fileName;
    if (!move_uploaded_file($temporaryPath, $destination)) {
        throw new RuntimeException('Sampul gagal disimpan ke folder proyek.');
    }
    return 'frontend/assets/covers/' . $fileName;
}
function delete_cover_file(?string $relativePath): void
{
    if (!$relativePath || !str_starts_with($relativePath, 'frontend/assets/covers/')) {
        return;
    }
    $projectRoot = dirname(__DIR__, 2);
    $fullPath = $projectRoot . DIRECTORY_SEPARATOR
        . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
    if (is_file($fullPath)) {
        @unlink($fullPath);
    }
}
function handle_server_error(Throwable $exception): void
{
    error_log(sprintf(
        '[E-Perpustakaan] %s in %s:%d',
        $exception->getMessage(),
        $exception->getFile(),
        $exception->getLine()
    ));
    json_response([
        'success' => false,
        'message' => 'Terjadi kesalahan pada server. Periksa log PHP untuk informasi teknis.',
    ], 500);
}
