<?php

declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . '_access.php';

const IPTV_ALLOWED_ENDPOINTS = [
    'channels',
    'search',
    'groups',
    'group',
    'channel',
    'm3u',
    'stream',
];

function iptvSendJson(array $payload, int $status): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function iptvBase64UrlEncode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function iptvBase64UrlDecode(string $value)
{
    $padding = strlen($value) % 4;
    if ($padding !== 0) {
        $value .= str_repeat('=', 4 - $padding);
    }
    return base64_decode(strtr($value, '-_', '+/'), true);
}

function iptvSigningKey(array $config, string $apiBase): string
{
    $configured = trim((string) ($config['IPTV_STREAM_SECRET'] ?? ''));
    if ($configured !== '') {
        return hash('sha256', $configured, true);
    }
    $tokens = $config['ACCESS_TOKENS'] ?? [];
    return hash('sha256', $apiBase . '|' . json_encode(is_array($tokens) ? $tokens : []), true);
}

function iptvSignedStreamUrl(array $config, string $apiBase, string $id, string $url, string $referrer, string $userAgent): string
{
    $expires = time() + 3600;
    $payload = iptvBase64UrlEncode(json_encode([
        'url' => $url,
        'referrer' => $referrer,
        'userAgent' => $userAgent,
    ], JSON_UNESCAPED_SLASHES));
    $signature = hash_hmac('sha256', $id . '|' . $expires . '|' . $payload, iptvSigningKey($config, $apiBase));
    return '/api/iptv/stream?' . http_build_query([
        'id' => $id,
        'p' => $payload,
        'exp' => $expires,
        'sig' => $signature,
    ], '', '&', PHP_QUERY_RFC3986);
}

function iptvResolveUrl(string $base, string $relative): string
{
    $relative = trim($relative);
    if ($relative === '' || preg_match('#^https?://#i', $relative)) {
        return $relative;
    }
    $baseParts = parse_url($base);
    if ($baseParts === false || empty($baseParts['scheme']) || empty($baseParts['host'])) {
        return $relative;
    }
    if (substr($relative, 0, 2) === '//') {
        return $baseParts['scheme'] . ':' . $relative;
    }
    $authority = $baseParts['scheme'] . '://' . $baseParts['host'];
    if (isset($baseParts['port'])) {
        $authority .= ':' . $baseParts['port'];
    }
    $relativeParts = parse_url($relative);
    $relativePath = (string) ($relativeParts['path'] ?? '');
    $path = substr($relativePath, 0, 1) === '/'
        ? $relativePath
        : preg_replace('#/[^/]*$#', '/', (string) ($baseParts['path'] ?? '/')) . $relativePath;
    $segments = [];
    foreach (explode('/', $path) as $segment) {
        if ($segment === '' || $segment === '.') {
            continue;
        }
        if ($segment === '..') {
            array_pop($segments);
            continue;
        }
        $segments[] = $segment;
    }
    $resolved = $authority . '/' . implode('/', $segments);
    if (isset($relativeParts['query'])) {
        $resolved .= '?' . $relativeParts['query'];
    }
    return $resolved;
}

function iptvFetch(string $url, string $referrer = '', string $userAgent = '', bool $streamRequest = false): array
{
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'error' => 'PHP cURL extension is not enabled', 'status' => 500];
    }
    $headers = ['Accept: */*'];
    $range = trim((string) ($_SERVER['HTTP_RANGE'] ?? ''));
    if ($streamRequest && preg_match('/^bytes=\d*-\d*$/', $range)) {
        $headers[] = 'Range: ' . $range;
    }
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 4,
        CURLOPT_CONNECTTIMEOUT => 12,
        CURLOPT_TIMEOUT => $streamRequest ? 40 : 35,
        CURLOPT_ENCODING => '',
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_USERAGENT => $userAgent !== '' ? $userAgent : 'AzuriumMovie/1.0',
    ]);
    if ($referrer !== '') {
        curl_setopt($curl, CURLOPT_REFERER, $referrer);
    }
    $body = curl_exec($curl);
    $error = curl_error($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $contentType = (string) curl_getinfo($curl, CURLINFO_CONTENT_TYPE);
    $effectiveUrl = (string) curl_getinfo($curl, CURLINFO_EFFECTIVE_URL);
    curl_close($curl);
    return [
        'ok' => $body !== false && $error === '' && $status >= 200 && $status < 400,
        'body' => is_string($body) ? $body : '',
        'error' => $error,
        'status' => $status,
        'contentType' => $contentType,
        'effectiveUrl' => $effectiveUrl !== '' ? $effectiveUrl : $url,
    ];
}

function iptvRewritePlaylist(string $body, string $baseUrl, array $config, string $apiBase, string $id, string $referrer, string $userAgent): string
{
    $rewrite = function (string $url) use ($baseUrl, $config, $apiBase, $id, $referrer, $userAgent): string {
        $resolved = iptvResolveUrl($baseUrl, html_entity_decode($url, ENT_QUOTES, 'UTF-8'));
        return iptvSignedStreamUrl($config, $apiBase, $id, $resolved, $referrer, $userAgent);
    };
    $lines = preg_split('/\r\n|\n|\r/', $body);
    foreach ($lines as &$line) {
        $trimmed = trim($line);
        if ($trimmed !== '' && substr($trimmed, 0, 1) !== '#') {
            $line = $rewrite($trimmed);
            continue;
        }
        if (strpos($line, 'URI="') !== false) {
            $line = preg_replace_callback('/URI="([^"]+)"/', function (array $matches) use ($rewrite): string {
                return 'URI="' . $rewrite($matches[1]) . '"';
            }, $line);
        }
    }
    unset($line);
    return implode("\n", $lines);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    iptvSendJson(['error' => 'Method not allowed'], 405);
}

$endpoint = strtolower(trim((string) ($_GET['endpoint'] ?? '')));
if (!in_array($endpoint, IPTV_ALLOWED_ENDPOINTS, true)) {
    iptvSendJson(['error' => 'Endpoint not found'], 404);
}

$config = azurium_load_private_config();
$access = azurium_request_access($config);
if (!$access['ok']) {
    iptvSendJson(['error' => $access['error']], (int) $access['status']);
}

$apiBase = getenv('IPTV_API_BASE') ?: trim((string) ($config['IPTV_API_BASE'] ?? ''));
if ($apiBase === '') {
    iptvSendJson(['error' => 'Server configuration is incomplete'], 500);
}
$baseParts = parse_url($apiBase);
if ($baseParts === false || strtolower((string) ($baseParts['scheme'] ?? '')) !== 'https' || empty($baseParts['host'])) {
    iptvSendJson(['error' => 'Server configuration is invalid'], 500);
}

$id = trim((string) ($_GET['id'] ?? ''));
if ($id !== '' && !preg_match('/^[A-Za-z0-9._@:-]{1,120}$/', $id)) {
    iptvSendJson(['error' => 'Channel ID is invalid'], 400);
}

if ($endpoint === 'stream') {
    if ($id === '') {
        iptvSendJson(['error' => 'Channel ID is required'], 400);
    }
    $payload = trim((string) ($_GET['p'] ?? ''));
    $referrer = '';
    $userAgent = '';
    if ($payload !== '') {
        $expires = (int) ($_GET['exp'] ?? 0);
        $signature = strtolower(trim((string) ($_GET['sig'] ?? '')));
        $expected = hash_hmac('sha256', $id . '|' . $expires . '|' . $payload, iptvSigningKey($config, $apiBase));
        if ($expires < time() - 30 || $expires > time() + 7200 || !preg_match('/^[a-f0-9]{64}$/', $signature) || !hash_equals($expected, $signature)) {
            iptvSendJson(['error' => 'Stream link has expired'], 403);
        }
        $decoded = iptvBase64UrlDecode($payload);
        $streamData = is_string($decoded) ? json_decode($decoded, true) : null;
        $targetUrl = trim((string) ($streamData['url'] ?? ''));
        $referrer = trim((string) ($streamData['referrer'] ?? ''));
        $userAgent = trim((string) ($streamData['userAgent'] ?? ''));
    } else {
        $detailUrl = rtrim($apiBase, '/') . '/channel?id=' . rawurlencode($id);
        $detailResponse = iptvFetch($detailUrl);
        $detail = json_decode($detailResponse['body'] ?? '', true);
        if (!$detailResponse['ok'] || !is_array($detail) || empty($detail['url'])) {
            iptvSendJson(['error' => 'Channel stream is unavailable'], 502);
        }
        $targetUrl = trim((string) $detail['url']);
        $referrer = trim((string) ($detail['referrer'] ?? ''));
        $userAgent = trim((string) ($detail['userAgent'] ?? ''));
    }
    $targetParts = parse_url($targetUrl);
    if ($targetParts === false || !in_array(strtolower((string) ($targetParts['scheme'] ?? '')), ['http', 'https'], true) || empty($targetParts['host'])) {
        iptvSendJson(['error' => 'Channel stream URL is invalid'], 502);
    }
    $streamResponse = iptvFetch($targetUrl, $referrer, $userAgent, true);
    if (!$streamResponse['ok']) {
        iptvSendJson(['error' => 'Live stream could not be reached'], 502);
    }
    $contentType = strtolower((string) $streamResponse['contentType']);
    $isPlaylist = strpos($contentType, 'mpegurl') !== false || strpos(ltrim($streamResponse['body']), '#EXTM3U') === 0;
    http_response_code((int) $streamResponse['status']);
    header('X-Content-Type-Options: nosniff');
    header('Access-Control-Allow-Origin: *');
    if ($isPlaylist) {
        header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');
        header('Cache-Control: no-store');
        echo iptvRewritePlaylist($streamResponse['body'], $streamResponse['effectiveUrl'], $config, $apiBase, $id, $referrer, $userAgent);
        exit;
    }
    header('Content-Type: ' . ($streamResponse['contentType'] !== '' ? $streamResponse['contentType'] : 'application/octet-stream'));
    header('Cache-Control: private, max-age=300');
    header('Accept-Ranges: bytes');
    header('Content-Length: ' . strlen($streamResponse['body']));
    echo $streamResponse['body'];
    exit;
}

$query = [];
foreach (['group', 'q', 'g', 'id'] as $key) {
    if (!isset($_GET[$key]) || is_array($_GET[$key])) {
        continue;
    }
    $value = trim((string) $_GET[$key]);
    if ($value === '' || strlen($value) > 160) {
        continue;
    }
    if ($key === 'id' && !preg_match('/^[A-Za-z0-9._@:-]{1,120}$/', $value)) {
        continue;
    }
    $query[$key] = $value;
}

$upstreamUrl = rtrim($apiBase, '/') . '/' . $endpoint;
if ($query !== []) {
    $upstreamUrl .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
}
$response = iptvFetch($upstreamUrl);
if (!$response['ok']) {
    iptvSendJson(['error' => 'IPTV provider is temporarily unavailable'], ($response['status'] ?? 0) >= 400 ? (int) $response['status'] : 502);
}
http_response_code((int) $response['status']);
header('Content-Type: ' . ($response['contentType'] !== '' ? $response['contentType'] : 'application/json; charset=utf-8'));
header('Cache-Control: ' . ($endpoint === 'm3u' ? 'no-store' : 'public, max-age=180'));
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
echo $response['body'];

