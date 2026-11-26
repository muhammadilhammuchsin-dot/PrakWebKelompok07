<?php

require_once __DIR__ . '/../shared/auth.php';
require_method('GET');
$user = current_user();
$normalizedUser = null;
if ($user !== null) {
    $name =
        $user['full_name']
        ?? $user['name']
        ?? $user['nama']
        ?? '';
    $identifier =
        $user['login_identifier']
        ?? $user['nip']
        ?? $user['npm']
        ?? $user['identity']
        ?? '';
    $roleCode =
        $user['role_code']
        ?? $user['role']
        ?? '';
    $normalizedUser = [
        'id' => $user['id'] ?? null,
        'user_id' => $user['user_id']
            ?? $user['id']
            ?? null,
        'role' => $user['role'] ?? $roleCode,
        'role_code' => $roleCode,
        'name' => $name,
        'full_name' => $name,
        'nama' => $name,
        'nip' => $identifier,
        'npm' => $identifier,
        'identity' => $identifier,
        'login_identifier' => $identifier,
        'email' => $user['email'] ?? '',
        'faculty' => $user['faculty'] ?? '',
        'study_program' => $user['study_program']
            ?? $user['prodi']
            ?? '',
        'prodi' => $user['prodi']
            ?? $user['study_program']
            ?? ''
    ];
}
json_response([
    'success' => true,
    'authenticated' => $normalizedUser !== null,
    'user' => $normalizedUser,
    'csrf_token' => csrf_token(),
    'message' => $normalizedUser !== null
        ? 'Data pengguna berhasil ditemukan.'
        : 'Tidak ada pengguna yang sedang login.'
]);
