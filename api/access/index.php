<?php

declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . '_access.php';

function accessJson(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    accessJson(['error' => 'Method not allowed'], 405);
}

$raw = file_get_contents('php://input');
$body = json_decode(is_string($raw) ? $raw : '', true);
if (!is_array($body)) {
    accessJson(['error' => 'Permintaan tidak valid.'], 400);
}

$action = strtolower(trim((string) ($body['action'] ?? 'status')));
$token = ozan_normalize_token((string) ($body['token'] ?? ''));
$deviceId = trim((string) ($body['deviceId'] ?? ''));
$config = ozan_load_private_config();

if (!isset($config['ACCESS_TOKENS']) || !is_array($config['ACCESS_TOKENS']) || count($config['ACCESS_TOKENS']) !== 10) {
    accessJson(['error' => 'Sepuluh token akses belum dikonfigurasi di server.'], 503);
}

$identity = ozan_access_identity($config, $token, $deviceId);
if (!$identity['ok']) {
    accessJson(['error' => $identity['error']], (int) $identity['status']);
}

if ($action === 'activate') {
    $result = ozan_update_bindings($config, function (array &$bindings) use ($identity): array {
        $existing = $bindings[$identity['tokenHash']] ?? null;
        if (is_array($existing) && !hash_equals((string) ($existing['deviceHash'] ?? ''), $identity['deviceHash'])) {
            return ['ok' => false, 'status' => 409, 'error' => 'Token ini sudah digunakan pada perangkat lain.', 'write' => false];
        }
        $bindings[$identity['tokenHash']] = [
            'deviceHash' => $identity['deviceHash'],
            'activatedAt' => $existing['activatedAt'] ?? gmdate('c'),
            'lastValidatedAt' => gmdate('c'),
        ];
        return ['ok' => true, 'write' => true];
    });
    if (!$result['ok']) {
        accessJson(['error' => $result['error']], (int) $result['status']);
    }
} elseif ($action === 'release') {
    $bound = ozan_validate_bound_access($config, $token, $deviceId);
    if (!$bound['ok']) {
        accessJson(['error' => $bound['error']], (int) $bound['status']);
    }
    $result = ozan_update_bindings($config, function (array &$bindings) use ($identity): array {
        unset($bindings[$identity['tokenHash']]);
        return ['ok' => true, 'write' => true];
    });
    if (!$result['ok']) {
        accessJson(['error' => $result['error']], (int) $result['status']);
    }
    accessJson(['ok' => true, 'released' => true]);
} elseif ($action === 'status') {
    $bound = ozan_validate_bound_access($config, $token, $deviceId);
    if (!$bound['ok']) {
        accessJson(['error' => $bound['error']], (int) $bound['status']);
    }
} else {
    accessJson(['error' => 'Aksi token tidak dikenal.'], 400);
}

accessJson([
    'ok' => true,
    'label' => $identity['label'],
    'maskedToken' => $identity['maskedToken'],
    'device' => substr(strtoupper($deviceId), 0, 8) . '••••',
]);

