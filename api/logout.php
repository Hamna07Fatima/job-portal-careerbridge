<?php
require __DIR__ . '/config.php';
session_start();
$_SESSION = [];
session_destroy();
respond(['ok' => true]);
