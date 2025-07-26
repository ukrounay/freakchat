<?php
include "../db.php";
header('Content-Type: application/json');

$username = $_GET['username'] ?? '';
if (!$username) {
    http_response_code(400);
    echo json_encode(["error" => "Missing username"]);
    exit;
}

$stmt = $conn->prepare("SELECT username, profile_picture, about, status FROM users WHERE username = ?");
$stmt->execute([$username]);
$result = $stmt->get_result();
$user = $result->fetch_assoc();

if (!$user) {
    http_response_code(404);
    echo json_encode(["error" => "User not found"]);
    exit;
}

echo json_encode($user);
