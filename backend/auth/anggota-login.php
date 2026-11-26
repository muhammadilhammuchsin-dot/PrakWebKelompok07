<?php
declare(strict_types=1);
require_once __DIR__ . '/../shared/auth.php';
protect_post_request();
$data = request_data();
$identity = request_string($data, ['npm', 'nip', 'login_identifier']);
$password = isset($data['password']) && is_string($data['password']) ? $data['password'] : '';
if ($identity === '' || $password === '') {
    json_response([
        'success' => false,
        'message' => 'NPM dan password wajib diisi.',
    ], 422);
}
try {
    $user = authenticate_role('anggota', $identity, $password);
    if ($user === null) {
        json_response([
            'success' => false,
            'message' => 'Identitas atau password salah, atau akun tidak aktif.',
        ], 401);
    }
    json_response([
        'success' => true,
        'message' => 'Login anggota berhasil.',
        'user' => $user,
        'csrf_token' => csrf_token(),
    ]);
} catch (Throwable $exception) {
    handle_server_error($exception);
}
