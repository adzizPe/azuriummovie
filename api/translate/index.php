<?php

declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . '_access.php';

function translateJson(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    translateJson(['error' => 'Method not allowed'], 405);
}

$config = ozan_load_private_config();
$access = ozan_request_access($config);
if (!$access['ok']) {
    translateJson(['error' => $access['error']], (int) $access['status']);
}

$raw = file_get_contents('php://input');
$body = json_decode(is_string($raw) ? $raw : '', true);
$text = trim((string) (is_array($body) ? ($body['text'] ?? '') : ''));
if ($text === '' || strlen($text) > 480) {
    translateJson(['error' => 'Teks terjemahan tidak valid.'], 400);
}
if (!function_exists('curl_init')) {
    translateJson(['error' => 'Ekstensi PHP cURL belum aktif.'], 500);
}

$url = 'https://api.mymemory.translated.net/get?' . http_build_query([
    'q' => $text,
    'langpair' => 'en|id',
    'mt' => '1',
], '', '&', PHP_QUERY_RFC3986);

$curl = curl_init($url);
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 2,
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_TIMEOUT => 18,
    CURLOPT_HTTPHEADER => ['Accept: application/json'],
    CURLOPT_USERAGENT => 'ozancicakmovie/1.0',
]);
$responseBody = curl_exec($curl);
$curlError = curl_error($curl);
$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
curl_close($curl);

if ($responseBody === false || $curlError !== '' || $status < 200 || $status >= 300) {
    translateJson(['error' => 'Layanan terjemahan sedang tidak tersedia.'], 502);
}

$result = json_decode((string) $responseBody, true);
$translated = html_entity_decode(trim((string) ($result['responseData']['translatedText'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');
if ($translated === '') {
    translateJson(['error' => 'Terjemahan belum ditemukan.'], 502);
}

translateJson(['translatedText' => $translated]);
