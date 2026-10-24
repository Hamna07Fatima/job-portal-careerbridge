<?php
require __DIR__ . '/config.php';
session_start();
if (empty($_SESSION['user'])) fail('Not signed in.', 401);
respond(['ok' => true, 'user' => $_SESSION['user']]);
