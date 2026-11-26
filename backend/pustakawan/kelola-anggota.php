<?php
declare(strict_types=1);
require_once __DIR__ . '/../shared/auth.php';
$user = require_role(['pustakawan']);
if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'GET') {
    try {
        $pdo = db();
        $keyword = trim((string) ($_GET['keyword'] ?? $_GET['q'] ?? ''));
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = min(100, max(1, (int) ($_GET['limit'] ?? 25)));
        $offset = ($page - 1) * $limit;
        $status = trim((string) ($_GET['status'] ?? ''));
        $conditions = ["r.role_code = 'anggota'"];
        $parameters = [];
        if ($keyword !== '') {
            $conditions[] = '(a.full_name LIKE :name_keyword OR a.npm LIKE :npm_keyword OR a.study_program LIKE :program_keyword)';
            $like = '%' . $keyword . '%';
            $parameters['name_keyword'] = $like;
            $parameters['npm_keyword'] = $like;
            $parameters['program_keyword'] = $like;
        }
        if (in_array($status, ['active', 'inactive', 'blocked'], true)) {
            $conditions[] = 'u.account_status = :account_status';
            $parameters['account_status'] = $status;
        }
        $whereSql = implode(' AND ', $conditions);
        $count = $pdo->prepare("
            SELECT COUNT(*)
            FROM akun_pengguna u
            INNER JOIN jenis_pengguna r ON r.id = u.role_id
            INNER JOIN profil_anggota a ON a.user_id = u.id
            WHERE {$whereSql}
        ");
        foreach ($parameters as $key => $value) {
            $count->bindValue(':' . $key, $value, PDO::PARAM_STR);
        }
        $count->execute();
        $total = (int) $count->fetchColumn();
        $sql = "
            SELECT
                u.id AS user_id, u.email, u.account_status, u.created_at,
                a.npm, a.full_name, a.faculty, a.study_program, a.entry_year, a.phone,
                (SELECT COUNT(*) FROM transaksi_peminjaman t WHERE t.member_user_id = u.id AND t.status = 'borrowed') AS active_loans
            FROM akun_pengguna u
            INNER JOIN jenis_pengguna r ON r.id = u.role_id
            INNER JOIN profil_anggota a ON a.user_id = u.id
            WHERE {$whereSql}
            ORDER BY a.full_name ASC
            LIMIT :limit OFFSET :offset
        ";
        $query = $pdo->prepare($sql);
        foreach ($parameters as $key => $value) {
            $query->bindValue(':' . $key, $value, PDO::PARAM_STR);
        }
        $query->bindValue(':limit', $limit, PDO::PARAM_INT);
        $query->bindValue(':offset', $offset, PDO::PARAM_INT);
        $query->execute();
        $members = $query->fetchAll();
        foreach ($members as &$member) {
            $member['user_id'] = (int) $member['user_id'];
            $member['active_loans'] = (int) $member['active_loans'];
            $member['nama'] = $member['full_name'];
            $member['prodi'] = $member['study_program'];
            $member['status'] = $member['account_status'];
        }
        unset($member);
        json_response([
            'success' => true,
            'data' => $members,
            'pagination' => [
                'current_page' => $page,
                'per_page' => $limit,
                'total_data' => $total,
                'total_pages' => (int) ceil($total / $limit),
            ],
        ]);
    } catch (Throwable $exception) {
        handle_server_error($exception);
    }
}
if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'POST') {
    protect_post_request();
    $data = request_data();
    $action = strtolower(request_string($data, ['action'], 'deactivate'));
    $memberId = request_int($data, ['user_id', 'member_user_id']);
    $npm = request_string($data, ['npm']);
    $statusMap = [
        'activate' => 'active',
        'deactivate' => 'inactive',
        'delete' => 'inactive',
        'block' => 'blocked',
        'unblock' => 'active',
    ];
    if (!isset($statusMap[$action])) {
        json_response(['success' => false, 'message' => 'Aksi anggota tidak dikenal.'], 422);
    }
    if (($memberId === null || $memberId < 1) && $npm === '') {
        json_response(['success' => false, 'message' => 'ID anggota atau NPM wajib diberikan.'], 422);
    }
    try {
        $pdo = db();
        if ($memberId !== null && $memberId > 0) {
            $find = $pdo->prepare("
                SELECT u.id
                FROM akun_pengguna u
                INNER JOIN jenis_pengguna r ON r.id = u.role_id
                INNER JOIN profil_anggota a ON a.user_id = u.id
                WHERE u.id = :user_id AND r.role_code = 'anggota'
                LIMIT 1
            ");
            $find->execute(['user_id' => $memberId]);
        } else {
            $find = $pdo->prepare("
                SELECT u.id
                FROM akun_pengguna u
                INNER JOIN jenis_pengguna r ON r.id = u.role_id
                INNER JOIN profil_anggota a ON a.user_id = u.id
                WHERE a.npm = :npm AND r.role_code = 'anggota'
                LIMIT 1
            ");
            $find->execute(['npm' => $npm]);
        }
        $foundId = $find->fetchColumn();
        if ($foundId === false) {
            json_response(['success' => false, 'message' => 'Anggota tidak ditemukan.'], 404);
        }
        $update = $pdo->prepare('UPDATE akun_pengguna SET account_status = :account_status WHERE id = :user_id');
        $update->execute([
            'account_status' => $statusMap[$action],
            'user_id' => (int) $foundId,
        ]);
        json_response([
            'success' => true,
            'message' => $action === 'delete'
                ? 'Anggota dinonaktifkan. Data dan riwayat transaksi tetap disimpan.'
                : 'Status anggota berhasil diperbarui.',
            'data' => [
                'user_id' => (int) $foundId,
                'account_status' => $statusMap[$action],
            ],
        ]);
    } catch (Throwable $exception) {
        handle_server_error($exception);
    }
}
header('Allow: GET, POST');
json_response(['success' => false, 'message' => 'Metode request tidak diizinkan.'], 405);
