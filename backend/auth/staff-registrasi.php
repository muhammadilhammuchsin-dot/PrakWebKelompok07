<?php

require_once __DIR__ . '/../shared/auth.php';
const STAFF_QUOTA = [
    'pustakawan' => 2,
    'kepus' => 1,
];
function staff_registration_quota(PDO $pdo, string $role): array
{
    if (!isset(STAFF_QUOTA[$role])) {
        throw new InvalidArgumentException('Role tidak valid.');
    }
    $statement = $pdo->prepare(
        "SELECT COUNT(*)
         FROM akun_pengguna a
         INNER JOIN jenis_pengguna j
            ON j.id = a.role_id
         WHERE j.role_code = :role"
    );
    $statement->execute(['role' => $role]);
    $total = (int) $statement->fetchColumn();
    $maximum = STAFF_QUOTA[$role];
    return [
        'role' => $role,
        'registered' => $total,
        'maximum' => $maximum,
        'remaining' => max(0, $maximum - $total),
        'registration_open' => $total < $maximum,
    ];
}
try {
    $pdo = db();
    if (
        strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET'
    ) {
        $role = request_string($_GET, ['role'], 'pustakawan');
        if (!isset(STAFF_QUOTA[$role])) {
            json_response([
                'success' => false,
                'message' => 'Jenis akun tidak valid.',
            ], 422);
        }
        json_response([
            'success' => true,
            'quota' => staff_registration_quota($pdo, $role),
        ]);
    }
    protect_post_request();
    $data = request_data();
    $role = request_string($data, ['role']);
    if (!isset(STAFF_QUOTA[$role])) {
        json_response([
            'success' => false,
            'message' => 'Jenis akun tidak valid.',
        ], 422);
    }
    $nama = request_string($data, ['nama', 'full_name']);
    $nip = request_string(
        $data,
        ['npm', 'nip', 'login_identifier']
    );
    $password = isset($data['password'])
        && is_string($data['password'])
        ? $data['password']
        : '';
    $konfirmasi = isset($data['konfirmasi_password'])
        && is_string($data['konfirmasi_password'])
        ? $data['konfirmasi_password']
        : '';
    if (mb_strlen($nama) < 3 || mb_strlen($nama) > 150) {
        json_response([
            'success' => false,
            'message' => 'Nama harus terdiri dari 3 sampai 150 karakter.',
        ], 422);
    }
    if (!preg_match('/^[A-Z0-9][A-Z0-9._-]{2,39}$/i', $nip)) {
        json_response([
            'success' => false,
            'message' => 'Format NIP atau kode identitas tidak valid.',
        ], 422);
    }
    if (strlen($password) < 8) {
        json_response([
            'success' => false,
            'message' => 'Password minimal 8 karakter.',
        ], 422);
    }
    if (!hash_equals($password, $konfirmasi)) {
        json_response([
            'success' => false,
            'message' => 'Konfirmasi password tidak sama.',
        ], 422);
    }
    $pdo->beginTransaction();
    $roleQuery = $pdo->prepare(
        "SELECT id
         FROM jenis_pengguna
         WHERE role_code = :role
         LIMIT 1
         FOR UPDATE"
    );
    $roleQuery->execute(['role' => $role]);
    $roleId = $roleQuery->fetchColumn();
    if ($roleId === false) {
        $pdo->rollBack();
        json_response([
            'success' => false,
            'message' => 'Role tidak ditemukan dalam database.',
        ], 500);
    }
    $countQuery = $pdo->prepare(
        "SELECT COUNT(*)
         FROM akun_pengguna
         WHERE role_id = :role_id"
    );
    $countQuery->execute([
        'role_id' => (int) $roleId,
    ]);
    $total = (int) $countQuery->fetchColumn();
    $maximum = STAFF_QUOTA[$role];
    if ($total >= $maximum) {
        $pdo->rollBack();
        $roleName = $role === 'kepus'
            ? 'Kepala Perpustakaan'
            : 'Pustakawan';
        json_response([
            'success' => false,
            'message' => "Kuota {$roleName} sudah terpenuhi. Pendaftaran ditutup.",
            'quota' => [
                'role' => $role,
                'registered' => $total,
                'maximum' => $maximum,
                'remaining' => 0,
                'registration_open' => false,
            ],
        ], 409);
    }
    $duplicate = $pdo->prepare(
        "SELECT id
         FROM akun_pengguna
         WHERE login_identifier = :identifier
         LIMIT 1"
    );
    $duplicate->execute([
        'identifier' => $nip,
    ]);
    if ($duplicate->fetchColumn() !== false) {
        $pdo->rollBack();
        json_response([
            'success' => false,
            'message' => 'NIP atau kode identitas sudah terdaftar.',
        ], 409);
    }
    $insertAccount = $pdo->prepare(
        "INSERT INTO akun_pengguna
            (
                role_id,
                login_identifier,
                password_hash,
                account_status
            )
         VALUES
            (
                :role_id,
                :identifier,
                :password_hash,
                'active'
            )"
    );
    $insertAccount->execute([
        'role_id' => (int) $roleId,
        'identifier' => $nip,
        'password_hash' => password_hash(
            $password,
            PASSWORD_DEFAULT
        ),
    ]);
    $userId = (int) $pdo->lastInsertId();
    $position = $role === 'kepus'
        ? 'Kepala Perpustakaan'
        : 'Pustakawan';
    $insertProfile = $pdo->prepare(
        "INSERT INTO profil_petugas_perpustakaan
            (
                user_id,
                nip,
                full_name,
                position_title
            )
         VALUES
            (
                :user_id,
                :nip,
                :full_name,
                :position
            )"
    );
    $insertProfile->execute([
        'user_id' => $userId,
        'nip' => $nip,
        'full_name' => $nama,
        'position' => $position,
    ]);
    $pdo->commit();
    $newTotal = $total + 1;
    $remaining = max(0, $maximum - $newTotal);
    $roleName = $role === 'kepus'
        ? 'Kepala Perpustakaan'
        : 'Pustakawan';
    json_response([
        'success' => true,
        'message' => "Pendaftaran {$roleName} berhasil. Akun telah tersimpan dan dapat digunakan untuk login.",
        'quota' => [
            'role' => $role,
            'registered' => $newTotal,
            'maximum' => $maximum,
            'remaining' => $remaining,
            'registration_open' => $newTotal < $maximum,
        ],
    ], 201);
} catch (PDOException $exception) {
    if (
        isset($pdo) &&
        $pdo instanceof PDO &&
        $pdo->inTransaction()
    ) {
        $pdo->rollBack();
    }
    if ((int) ($exception->errorInfo[1] ?? 0) === 1062) {
        json_response([
            'success' => false,
            'message' => 'NIP atau kode identitas sudah digunakan.',
        ], 409);
    }
    handle_server_error($exception);
} catch (Throwable $exception) {
    if (
        isset($pdo) &&
        $pdo instanceof PDO &&
        $pdo->inTransaction()
    ) {
        $pdo->rollBack();
    }
    handle_server_error($exception);
}
