<?php
// Database connection (XAMPP defaults: user root, empty password)
const DB_HOST = 'localhost';
const DB_NAME = 'careerbridge';
const DB_USER = 'root';
const DB_PASS = '';

header('Content-Type: application/json; charset=utf-8');

function db(): PDO {
    static $pdo = null;
    if (!$pdo) {
        $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
    return $pdo;
}

function respond(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function fail(string $error, int $code = 400): void {
    respond(['ok' => false, 'error' => $error], $code);
}

function input(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

set_exception_handler(function (Throwable $e) {
    fail('Server error: ' . $e->getMessage(), 500);
});
