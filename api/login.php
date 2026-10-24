<?php
require __DIR__ . '/config.php';

const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 30;

$in       = input();
$email    = strtolower(trim($in['email'] ?? ''));
$password = $in['password'] ?? '';
$remember = !empty($in['remember']);

$pdo = db();

// Lock-out check (per email)
$st = $pdo->prepare('SELECT GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), locked_until)) FROM login_attempts WHERE email = ? AND locked_until > NOW()');
$st->execute([$email]);
$wait = $st->fetchColumn();
if ($wait) fail("Too many failed attempts. Try again in $wait seconds.", 429);

$st = $pdo->prepare('SELECT * FROM users WHERE email = ?');
$st->execute([$email]);
$user = $st->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    // locked_until must be assigned before attempts (MySQL evaluates left to right)
    $pdo->prepare('INSERT INTO login_attempts (email, attempts) VALUES (?, 1)
        ON DUPLICATE KEY UPDATE
          locked_until = IF(attempts + 1 >= ?, NOW() + INTERVAL ? SECOND, locked_until),
          attempts     = IF(attempts + 1 >= ?, 0, attempts + 1)')
        ->execute([$email, MAX_ATTEMPTS, LOCK_SECONDS, MAX_ATTEMPTS]);
    fail('Incorrect email or password.', 401);
}

$pdo->prepare('DELETE FROM login_attempts WHERE email = ?')->execute([$email]);

// Status is only revealed after the password is correct
if ($user['status'] === 'pending')   fail('Your company account is waiting for admin approval. You will be able to log in once it has been approved.', 403);
if ($user['status'] === 'suspended') fail('This account has been suspended. Please contact the CareerBridge support team.', 403);

session_set_cookie_params(['lifetime' => $remember ? 60 * 60 * 24 * 30 : 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
session_start();
session_regenerate_id(true);
$_SESSION['user'] = ['id' => (int)$user['id'], 'role' => $user['role'], 'name' => $user['name'], 'email' => $user['email']];

respond(['ok' => true, 'user' => $_SESSION['user']]);
