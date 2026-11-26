<?php
// Memvalidasi token CSRF pada request yang mengubah data.
require_once __DIR__ . '/functions.php';
function csrf_token(): string
{
    start_secure_session();
    if (
        empty($_SESSION['csrf_token']) ||
        !is_string($_SESSION['csrf_token'])
    ) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}
function require_valid_csrf(): void
{
    start_secure_session();
    $data = request_data();
    $providedToken =
        $_SERVER['HTTP_X_CSRF_TOKEN']
        ?? $data['_csrf']
        ?? '';
    $sessionToken = $_SESSION['csrf_token'] ?? '';
    if (
        !is_string($providedToken) ||
        !is_string($sessionToken) ||
        $sessionToken === '' ||
        !hash_equals($sessionToken, $providedToken)
    ) {
        json_response([
            'success' => false,
            'message' => 'Token keamanan tidak valid. Silakan muat ulang halaman.'
        ], 419);
    }
}
$requestedFile = isset($_SERVER['SCRIPT_FILENAME'])
    ? realpath((string) $_SERVER['SCRIPT_FILENAME'])
    : false;
if (
    $requestedFile !== false &&
    $requestedFile === realpath(__FILE__)
) {
    require_method('GET');
    start_secure_session();
    json_response([
        'success' => true,
        'message' => 'Token keamanan berhasil dibuat.',
        'csrf_token' => csrf_token()
    ]);
}
