<?php

declare(strict_types=1);

const ALLOWED_ENDPOINTS = [
    'home',
    'movies',
    'tv',
    'animation',
    'kids',
    'tvshows',
    'search',
    'suggest',
    'detail',
    'recommend',
    'season',
    'stream',
    'captions',
];

const ALLOWED_QUERY_PARAMS = [
    'page',
    'q',
    'id',
    'se',
    'ep',
    'streamId',
];

function sendJson(array $payload, int $status): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    sendJson(['error' => 'Method not allowed'], 405);
}

$endpoint = strtolower(trim((string) ($_GET['endpoint'] ?? '')));
if (!in_array($endpoint, ALLOWED_ENDPOINTS, true)) {
    sendJson(['error' => 'Endpoint not found'], 404);
}

$apiBase = getenv('MOVIEBOX_API_BASE') ?: '';
$configPath = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.api-config.php';

if ($apiBase === '' && is_file($configPath)) {
    $config = require $configPath;
    if (is_array($config) && isset($config['MOVIEBOX_API_BASE'])) {
        $apiBase = trim((string) $config['MOVIEBOX_API_BASE']);
    }
}

if ($apiBase === '') {
    sendJson(['error' => 'Server configuration is incomplete'], 500);
}

$baseParts = parse_url($apiBase);
if (
    $baseParts === false
    || strtolower((string) ($baseParts['scheme'] ?? '')) !== 'https'
    || empty($baseParts['host'])
) {
    sendJson(['error' => 'Server configuration is invalid'], 500);
}

$query = [];
foreach (ALLOWED_QUERY_PARAMS as $key) {
    if (!isset($_GET[$key]) || is_array($_GET[$key])) {
        continue;
    }

    $value = trim((string) $_GET[$key]);
    if ($value === '' || strlen($value) > 160) {
        continue;
    }
    if (in_array($key, ['page', 'se', 'ep'], true) && !preg_match('/^\d{1,4}$/', $value)) {
        continue;
    }
    if (in_array($key, ['id', 'streamId'], true) && !preg_match('/^\d{1,30}$/', $value)) {
        continue;
    }

    $query[$key] = $value;
}

$upstreamUrl = rtrim($apiBase, '/') . '/' . $endpoint;
if ($query !== []) {
    $upstreamUrl .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
}

if (!function_exists('curl_init')) {
    sendJson(['error' => 'PHP cURL extension is not enabled'], 500);
}

$curl = curl_init($upstreamUrl);
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 3,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_ENCODING => '',
    CURLOPT_HTTPHEADER => ['Accept: application/json'],
    CURLOPT_USERAGENT => 'OzancicakMovie/1.0',
]);

$body = curl_exec($curl);
$curlError = curl_error($curl);
$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$contentType = (string) curl_getinfo($curl, CURLINFO_CONTENT_TYPE);
curl_close($curl);

if ($body === false || $curlError !== '') {
    sendJson(['error' => 'Movie provider could not be reached'], 502);
}

if ($status < 200 || $status >= 300) {
    sendJson(['error' => 'Movie provider is temporarily unavailable'], $status >= 400 ? $status : 502);
}

$cacheSeconds = in_array($endpoint, ['stream', 'captions'], true) ? 30 : 180;
http_response_code($status);
header('Content-Type: ' . ($contentType !== '' ? $contentType : 'application/json; charset=utf-8'));
header('Cache-Control: public, max-age=' . $cacheSeconds);
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
echo $body;

