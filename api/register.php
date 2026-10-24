<?php
require __DIR__ . '/config.php';

const EMPLOYER_NEEDS_APPROVAL = true;   // US-21: admin must approve new companies

$in    = input();
$role  = $in['role'] ?? '';
$name  = trim($in['name'] ?? '');
$email = strtolower(trim($in['email'] ?? ''));
$pw    = $in['password'] ?? '';

if (!in_array($role, ['seeker', 'employer'], true)) fail('Choose a valid account type.');
if (mb_strlen($name) < 3) fail('Enter your full name (at least 3 characters).');
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address.');
if (!preg_match('/^(?=.*[A-Za-z])(?=.*\d).{8,}$/', $pw)) fail('Use at least 8 characters with a letter and a number.');

$pdo = db();
$industryId = null;
$company = '';
if ($role === 'employer') {
    $company = trim($in['company'] ?? '');
    if (mb_strlen($company) < 2) fail('Enter your company name.');
    $st = $pdo->prepare('SELECT id FROM industries WHERE name = ?');
    $st->execute([$in['industry'] ?? '']);
    $industryId = $st->fetchColumn();
    if (!$industryId) fail('Select an industry.');
}

$status = ($role === 'employer' && EMPLOYER_NEEDS_APPROVAL) ? 'pending' : 'active';

try {
    $pdo->beginTransaction();
    $pdo->prepare('INSERT INTO users (role, name, email, password_hash, status) VALUES (?,?,?,?,?)')
        ->execute([$role, $name, $email, password_hash($pw, PASSWORD_DEFAULT), $status]);
    $id = (int)$pdo->lastInsertId();
    if ($role === 'employer') {
        $pdo->prepare('INSERT INTO employer_profiles (user_id, company_name, industry_id) VALUES (?,?,?)')
            ->execute([$id, $company, $industryId]);
    }
    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if ($e->getCode() === '23000') fail('An account with this email already exists. Try logging in instead.', 409);
    throw $e;
}

respond(['ok' => true, 'status' => $status]);
