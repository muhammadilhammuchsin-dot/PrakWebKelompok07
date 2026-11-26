<?php
declare(strict_types=1);
// Mengatur autentikasi, sesi, dan pembatasan peran pengguna.
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/csrf.php';
start_secure_session();
function current_user(): ?array
{
    $user = $_SESSION['user'] ?? null;
    return is_array($user) ? $user : null;
}
function login_user(array $user): void
{
    session_regenerate_id(true);
    $role = (string) ($user['role_code'] ?? $user['role'] ?? '');
    $identifier = (string) ($user['login_identifier'] ?? '');
    $_SESSION['user'] = [
        'id' => (int) ($user['id'] ?? 0),
        'user_id' => (int) ($user['id'] ?? 0),
        'role' => $role,
        'role_code' => $role,
        'login_identifier' => $identifier,
        'npm' => $user['npm'] ?? ($role === 'anggota' ? $identifier : null),
        'nip' => $user['nip'] ?? (in_array($role, ['pustakawan', 'kepus'], true) ? $identifier : null),
        'email' => $user['email'] ?? null,
        'name' => $user['full_name'] ?? 'Pengguna',
        'full_name' => $user['full_name'] ?? 'Pengguna',
        'nama' => $user['full_name'] ?? 'Pengguna',
        'faculty' => $user['faculty'] ?? null,
        'study_program' => $user['study_program'] ?? null,
        'prodi' => $user['study_program'] ?? null,
        'position_title' => $user['position_title'] ?? null,
    ];
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
function require_login(): array
{
    $user = current_user();
    if ($user === null) {
        json_response([
            'success' => false,
            'message' => 'Silakan login terlebih dahulu.',
        ], 401);
    }
    return $user;
}
function require_role(array $allowedRoles): array
{
    $user = require_login();
    if (!in_array((string) $user['role'], $allowedRoles, true)) {
        json_response([
            'success' => false,
            'message' => 'Anda tidak memiliki hak akses untuk melakukan tindakan ini.',
        ], 403);
    }
    return $user;
}
function logout_user(): void
{
    start_secure_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $parameters = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $parameters['path'],
            'domain' => $parameters['domain'],
            'secure' => $parameters['secure'],
            'httponly' => $parameters['httponly'],
            'samesite' => $parameters['samesite'] ?? 'Lax',
        ]);
    }
    session_destroy();
}
function protect_post_request(): void
{
    require_method('POST');
    require_valid_csrf();
}
 function authenticate_role(string $roleCode, string $identity, string $password): ?array
{
    $pdo = db();
    if ($roleCode === 'anggota') {
        $sql = "
            SELECT
                u.id,
                u.login_identifier,
                u.email,
                u.password_hash,
                u.account_status,
                r.role_code,
                ap.npm,
                ap.full_name,
                ap.faculty,
                ap.study_program
            FROM akun_pengguna u
            INNER JOIN jenis_pengguna r ON r.id = u.role_id
            INNER JOIN profil_anggota ap ON ap.user_id = u.id
            WHERE r.role_code = :role_code
              AND (u.login_identifier = :login_identifier OR ap.npm = :npm)
            LIMIT 1
        ";
        $statement = $pdo->prepare($sql);
        $statement->execute([
            'role_code' => $roleCode,
            'login_identifier' => $identity,
            'npm' => $identity,
        ]);
    } elseif (in_array($roleCode, ['pustakawan', 'kepus'], true)) {
        $sql = "
            SELECT
                u.id,
                u.login_identifier,
                u.email,
                u.password_hash,
                u.account_status,
                r.role_code,
                sp.nip,
                sp.full_name,
                sp.position_title
            FROM akun_pengguna u
            INNER JOIN jenis_pengguna r ON r.id = u.role_id
            INNER JOIN profil_petugas_perpustakaan sp ON sp.user_id = u.id
            WHERE r.role_code = :role_code
              AND (u.login_identifier = :login_identifier OR sp.nip = :nip)
            LIMIT 1
        ";
        $statement = $pdo->prepare($sql);
        $statement->execute([
            'role_code' => $roleCode,
            'login_identifier' => $identity,
            'nip' => $identity,
        ]);
    } else {
        return null;
    }
    $user = $statement->fetch();
    if (!$user || $user['account_status'] !== 'active') {
        return null;
    }
    if (!password_verify($password, (string) $user['password_hash'])) {
        return null;
    }
    if (password_needs_rehash((string) $user['password_hash'], PASSWORD_DEFAULT)) {
        $newHash = password_hash($password, PASSWORD_DEFAULT);
        $updateHash = $pdo->prepare('UPDATE akun_pengguna SET password_hash = :password_hash WHERE id = :user_id');
        $updateHash->execute([
            'password_hash' => $newHash,
            'user_id' => (int) $user['id'],
        ]);
    }
    $updateLogin = $pdo->prepare('UPDATE akun_pengguna SET last_login_at = CURRENT_TIMESTAMP WHERE id = :user_id');
    $updateLogin->execute(['user_id' => (int) $user['id']]);
    login_user($user);
    return current_user();
}
