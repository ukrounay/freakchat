<?php
include "../db.php";

header('Content-Type: application/json');

$username = $_POST['username'] ?? '';
$password = $_POST['password'] ?? '';

if (!$username || !$password) {
    http_response_code(400);
    echo json_encode(["error" => "Missing credentials"]);
    exit;
}

$stmt = $conn->prepare("SELECT * FROM users WHERE username = ?");
$stmt->execute([$username]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user || !password_verify($password, $user['password'])) {
    http_response_code(401);
    echo json_encode(["error" => "Invalid login"]);
    exit;
}

$_SESSION['user_id'] = $user['id'];

echo json_encode([
    "id" => $user['id'],
    "username" => $user['username'],
    "email" => $user['email'],
    "profile_picture" => $user['profile_picture'],
    "about" => $user['about']
]);
