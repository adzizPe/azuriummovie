<?php

declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . '_access.php';

const DONGHUA_ALLOWED_ENDPOINTS = [
    'latest',
    'trending',
    'videos',
    'coming',
    'complete',
    'favorite',
    'search',
    'genres',
    'category',
    'detail',
    'post',
    'jadwal',
    'slide',
];

const DONGHUA_ALLOWED_QUERY_PARAMS = [
    'page',
    'count',
    'q',
    'id',
    'type',
];

function donghuaSendJson(array $payload, int $status): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    donghuaSendJson(['error' => 'Method not allowed'], 405);
}

$endpoint = strtolower(trim((string) ($_GET['endpoint'] ?? '')));
if (!in_array($endpoint, DONGHUA_ALLOWED_ENDPOINTS, true)) {
    donghuaSendJson(['error' => 'Endpoint not found'], 404);
}

$config = azurium_load_private_config();
$access = azurium_request_access($config);
if (!$access['ok']) {
    donghuaSendJson(['error' => $access['error']], (int) $access['status']);
}

$apiBase = getenv('DONGHUA_API_BASE') ?: trim((string) ($config['DONGHUA_API_BASE'] ?? ''));
if ($apiBase === '') {
    donghuaSendJson(['error' => 'Server configuration is incomplete'], 500);
}

$baseParts = parse_url($apiBase);
if (
    $baseParts === false
    || strtolower((string) ($baseParts['scheme'] ?? '')) !== 'https'
    || empty($baseParts['host'])
) {
    donghuaSendJson(['error' => 'Server configuration is invalid'], 500);
}

$query = [];
foreach (DONGHUA_ALLOWED_QUERY_PARAMS as $key) {
    if (!isset($_GET[$key]) || is_array($_GET[$key])) {
        continue;
    }

    $value = trim((string) $_GET[$key]);
    if ($value === '' || strlen($value) > 160) {
        continue;
    }
    if ($key === 'page' && !preg_match('/^\d{1,4}$/', $value)) {
        continue;
    }
    if ($key === 'count' && !preg_match('/^\d{1,3}$/', $value)) {
        continue;
    }
    if ($key === 'id' && !preg_match('/^\d{1,12}$/', $value)) {
        continue;
    }
    if ($key === 'type' && !in_array(strtolower($value), ['latest', 'complete', 'today'], true)) {
        continue;
    }
    $query[$key] = $value;
}

$upstreamUrl = rtrim($apiBase, '/') . '/' . $endpoint;
if ($query !== []) {
    $upstreamUrl .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
}

if (!function_exists('curl_init')) {
    donghuaSendJson(['error' => 'PHP cURL extension is not enabled'], 500);
}

$curl = curl_init($upstreamUrl);
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 3,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 35,
    CURLOPT_ENCODING => '',
    CURLOPT_HTTPHEADER => ['Accept: application/json'],
    CURLOPT_USERAGENT => 'AzuriumMovie/1.0',
]);

$body = curl_exec($curl);
$curlError = curl_error($curl);
$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$contentType = (string) curl_getinfo($curl, CURLINFO_CONTENT_TYPE);
curl_close($curl);

if ($body === false || $curlError !== '') {
    donghuaSendJson(['error' => 'Donghua provider could not be reached'], 502);
}
if ($status < 200 || $status >= 300) {
    donghuaSendJson(['error' => 'Donghua provider is temporarily unavailable'], $status >= 400 ? $status : 502);
}

http_response_code($status);
header('Content-Type: ' . ($contentType !== '' ? $contentType : 'application/json; charset=utf-8'));
header('Cache-Control: public, max-age=180');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
echo $body;

