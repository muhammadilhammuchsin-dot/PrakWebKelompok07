<?php
declare(strict_types=1);
require_once __DIR__ . '/../shared/auth.php';
protect_post_request();
require_role(['pustakawan']);
logout_user();
json_response([
    'success' => true,
    'message' => 'Logout pustakawan berhasil.',
]);
