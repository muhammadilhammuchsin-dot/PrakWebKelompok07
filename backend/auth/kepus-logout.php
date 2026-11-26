<?php
declare(strict_types=1);
require_once __DIR__ . '/../shared/auth.php';
protect_post_request();
require_role(['kepus']);
logout_user();
json_response([
    'success' => true,
    'message' => 'Anda berhasil logout.'
]);
