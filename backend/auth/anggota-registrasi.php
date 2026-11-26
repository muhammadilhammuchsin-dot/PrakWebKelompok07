<?php
declare(strict_types=1);
require_once __DIR__ . '/../shared/auth.php';
protect_post_request();
$data = request_data();
$npm = request_string($data, ['npm', 'login_identifier']);
$fullName = request_string($data, ['nama', 'full_name', 'nama_lengkap']);
$studyProgram = request_string($data, ['prodi', 'study_program', 'program_studi']);
$email = strtolower(request_string($data, ['email']));
$password = isset($data['password']) && is_string($data['password']) ? $data['password'] : '';
$confirmation = request_string($data, ['passwordConfirm', 'password_confirmation', 'confirm_password', 'konfirmasi_password']);
if ($npm === '' || $fullName === '' || $studyProgram === '' || $email === '' || $password === '') {
    json_response(['success' => false, 'message' => 'Nama, NPM, program studi, email, dan password wajib diisi.'], 422);
}
if (!preg_match('/^[0-9]{8,20}$/', $npm)) {
    json_response(['success' => false, 'message' => 'NPM harus terdiri dari 8 sampai 20 angka.'], 422);
}
if (mb_strlen($fullName) < 3 || mb_strlen($fullName) > 150) {
    json_response(['success' => false, 'message' => 'Nama lengkap harus terdiri dari 3 sampai 150 karakter.'], 422);
}
if (mb_strlen($studyProgram) < 2 || mb_strlen($studyProgram) > 150) {
    json_response(['success' => false, 'message' => 'Program studi tidak valid.'], 422);
}
if (!valid_email($email)) {
    json_response(['success' => false, 'message' => 'Format email tidak valid.'], 422);
}
if (!valid_password($password)) {
    json_response(['success' => false, 'message' => 'Password minimal harus 8 karakter.'], 422);
}
if ($confirmation === '' || !hash_equals($password, $confirmation)) {
    json_response(['success' => false, 'message' => 'Konfirmasi password tidak cocok.'], 422);
}
$pdo = null;
try {
    $pdo = db();
    $pdo->beginTransaction();
    $roleQuery = $pdo->prepare("SELECT id FROM jenis_pengguna WHERE role_code = 'anggota' LIMIT 1");
    $roleQuery->execute();
    $roleId = $roleQuery->fetchColumn();
    if ($roleId === false) {
        throw new RuntimeException('Role anggota belum tersedia. Import database/perpustakaan.sql terlebih dahulu.');
    }
    $accountInsert = $pdo->prepare("
        INSERT INTO akun_pengguna (
            role_id, login_identifier, email, password_hash, account_status
        ) VALUES (
            :role_id, :login_identifier, :email, :password_hash, 'active'
        )
    ");
    $accountInsert->execute([
        'role_id' => (int) $roleId,
        'login_identifier' => $npm,
        'email' => $email,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
    ]);
    $userId = (int) $pdo->lastInsertId();
    $profileInsert = $pdo->prepare("
        INSERT INTO profil_anggota (
            user_id, npm, full_name, study_program
        ) VALUES (
            :user_id, :npm, :full_name, :study_program
        )
    ");
    $profileInsert->execute([
        'user_id' => $userId,
        'npm' => $npm,
        'full_name' => $fullName,
        'study_program' => $studyProgram,
    ]);
    $pdo->commit();
    json_response([
        'success' => true,
        'message' => 'Registrasi anggota berhasil. Silakan login menggunakan NPM dan password.',
        'data' => [
            'user_id' => $userId,
            'npm' => $npm,
            'nama' => $fullName,
            'prodi' => $studyProgram,
            'email' => $email,
        ],
    ], 201);
} catch (PDOException $exception) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if (db_driver_error_code($exception) === 1062) {
        json_response(['success' => false, 'message' => 'NPM atau email sudah terdaftar.'], 409);
    }
    handle_server_error($exception);
} catch (Throwable $exception) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    handle_server_error($exception);
}
