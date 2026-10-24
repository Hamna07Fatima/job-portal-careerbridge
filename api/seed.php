<?php
// Run ONCE in the browser, then delete this file. Sets real password hashes on the demo accounts.
require __DIR__ . '/config.php';
$pdo = db();
$accounts = [
    ['seeker',   'Ayesha Khan',    'seeker@demo.com',        'Demo@1234'],
    ['employer', 'Bilal Ahmed',    'employer@demo.com',      'Demo@1234'],
    ['admin',    'Platform Admin', 'admin@careerbridge.com', 'Admin@1234'],
];
foreach ($accounts as [$role, $name, $email, $pw]) {
    $hash = password_hash($pw, PASSWORD_DEFAULT);
    $st = $pdo->prepare('UPDATE users SET password_hash = ? WHERE email = ?');
    $st->execute([$hash, $email]);
    if (!$st->rowCount()) {
        $pdo->prepare('INSERT INTO users (role, name, email, password_hash, status) VALUES (?,?,?,?,"active")')
            ->execute([$role, $name, $email, $hash]);
    }
}
$emp = $pdo->query("SELECT id FROM users WHERE email='employer@demo.com'")->fetchColumn();
$pdo->prepare("INSERT IGNORE INTO employer_profiles (user_id, company_name, industry_id)
               SELECT ?, 'Nexa Technologies', id FROM industries WHERE name = 'Information Technology'")->execute([$emp]);
respond(['ok' => true, 'message' => 'Demo accounts ready. Delete api/seed.php now.']);
