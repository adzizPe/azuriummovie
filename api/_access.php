<?php

declare(strict_types=1);

function azurium_root_path(): string
{
    return dirname(__DIR__);
}

function azurium_load_private_config(): array
{
    $path = azurium_root_path() . DIRECTORY_SEPARATOR . '.api-config.php';
    if (!is_file($path)) {
        return [];
    }
    $config = require $path;
    return is_array($config) ? $config : [];
}

function azurium_normalize_token(string $token): string
{
    return strtoupper(trim($token));
}

function azurium_token_index(array $config, string $candidate): int
{
    $tokens = $config['ACCESS_TOKENS'] ?? [];
    if (!is_array($tokens)) {
        return 0;
    }
    $candidate = azurium_normalize_token($candidate);
    foreach (array_values($tokens) as $index => $token) {
        if (is_string($token) && hash_equals(azurium_normalize_token($token), $candidate)) {
            return $index + 1;
        }
    }
    return 0;
}

function azurium_review_token_index(array $config, string $candidate): int
{
    $tokens = $config['PLAY_REVIEW_TOKENS'] ?? [];
    if (!is_array($tokens)) {
        return 0;
    }
    $candidate = azurium_normalize_token($candidate);
    foreach (array_values($tokens) as $index => $token) {
        if (is_string($token) && hash_equals(azurium_normalize_token($token), $candidate)) {
            return $index + 1;
        }
    }
    return 0;
}

function azurium_valid_device_id(string $deviceId): bool
{
    return preg_match('/^[A-Za-z0-9._:-]{16,100}$/', $deviceId) === 1;
}

function azurium_binding_path(array $config): string
{
    $custom = trim((string) ($config['ACCESS_BINDINGS_FILE'] ?? ''));
    return $custom !== '' ? $custom : azurium_root_path() . DIRECTORY_SEPARATOR . '.access-bindings.json';
}

function azurium_rate_limit_path(array $config): string
{
    $custom = trim((string) ($config['ACCESS_RATE_LIMIT_FILE'] ?? ''));
    return $custom !== '' ? $custom : azurium_root_path() . DIRECTORY_SEPARATOR . '.access-rate-limit.json';
}

function azurium_rate_key(): string
{
    $address = trim((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    return hash('sha256', $address);
}

function azurium_rate_limit(array $config, bool $recordFailure = false, bool $clear = false): array
{
    $path = azurium_rate_limit_path($config);
    $handle = fopen($path, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) {
            fclose($handle);
        }
        return ['blocked' => false, 'retryAfter' => 0];
    }

    $now = time();
    $windowSeconds = 15 * 60;
    $attemptLimit = 8;
    rewind($handle);
    $contents = stream_get_contents($handle);
    $decoded = json_decode(is_string($contents) ? $contents : '', true);
    $entries = is_array($decoded) ? $decoded : [];

    foreach ($entries as $entryKey => $entry) {
        if (!is_array($entry) || (int) ($entry['resetAt'] ?? 0) <= $now) {
            unset($entries[$entryKey]);
        }
    }

    $key = azurium_rate_key();
    if ($clear) {
        unset($entries[$key]);
    } elseif ($recordFailure) {
        $entry = $entries[$key] ?? ['count' => 0, 'resetAt' => $now + $windowSeconds];
        $entry['count'] = (int) ($entry['count'] ?? 0) + 1;
        $entry['resetAt'] = max((int) ($entry['resetAt'] ?? 0), $now + $windowSeconds);
        $entries[$key] = $entry;
    }

    $entry = $entries[$key] ?? ['count' => 0, 'resetAt' => 0];
    $blocked = (int) ($entry['count'] ?? 0) >= $attemptLimit;
    $retryAfter = $blocked ? max(1, (int) ($entry['resetAt'] ?? $now) - $now) : 0;

    rewind($handle);
    ftruncate($handle, 0);
    fwrite($handle, json_encode($entries, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    return ['blocked' => $blocked, 'retryAfter' => $retryAfter];
}

function azurium_read_bindings(array $config): array
{
    $path = azurium_binding_path($config);
    if (!is_file($path)) {
        return [];
    }
    $handle = fopen($path, 'rb');
    if ($handle === false) {
        return [];
    }
    flock($handle, LOCK_SH);
    $contents = stream_get_contents($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    $decoded = json_decode(is_string($contents) ? $contents : '', true);
    return is_array($decoded) ? $decoded : [];
}

function azurium_update_bindings(array $config, callable $callback): array
{
    $path = azurium_binding_path($config);
    $handle = fopen($path, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) {
            fclose($handle);
        }
        return ['ok' => false, 'status' => 500, 'error' => 'Penyimpanan validasi token tidak dapat ditulis.'];
    }
    rewind($handle);
    $contents = stream_get_contents($handle);
    $decoded = json_decode(is_string($contents) ? $contents : '', true);
    $bindings = is_array($decoded) ? $decoded : [];
    $result = $callback($bindings);
    if (($result['write'] ?? false) === true) {
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, json_encode($bindings, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        fflush($handle);
    }
    flock($handle, LOCK_UN);
    fclose($handle);
    return $result;
}

function azurium_access_identity(array $config, string $token, string $deviceId): array
{
    $reviewIndex = azurium_review_token_index($config, $token);
    $index = azurium_token_index($config, $token);
    if ($index === 0 && $reviewIndex === 0) {
        return ['ok' => false, 'status' => 401, 'error' => 'Token tidak valid.'];
    }
    if (!azurium_valid_device_id($deviceId)) {
        return ['ok' => false, 'status' => 400, 'error' => 'Identitas perangkat tidak valid.'];
    }
    $tokenHash = hash('sha256', azurium_normalize_token($token));
    $deviceHash = hash('sha256', $deviceId);
    return [
        'ok' => true,
        'index' => $index,
        'isReview' => $reviewIndex > 0,
        'tokenHash' => $tokenHash,
        'deviceHash' => $deviceHash,
        'label' => $reviewIndex > 0 ? 'Google Play Reviewer' : sprintf('Token %02d', $index),
        'maskedToken' => '••••' . substr(azurium_normalize_token($token), -4),
    ];
}

function azurium_validate_bound_access(array $config, string $token, string $deviceId): array
{
    $identity = azurium_access_identity($config, $token, $deviceId);
    if (!$identity['ok']) {
        return $identity;
    }
    if (($identity['isReview'] ?? false) === true) {
        return $identity;
    }
    $bindings = azurium_read_bindings($config);
    $binding = $bindings[$identity['tokenHash']] ?? null;
    if (!is_array($binding)) {
        return ['ok' => false, 'status' => 401, 'error' => 'Token belum diaktifkan pada perangkat ini.'];
    }
    if (!hash_equals((string) ($binding['deviceHash'] ?? ''), $identity['deviceHash'])) {
        return ['ok' => false, 'status' => 403, 'error' => 'Token sudah terikat pada perangkat lain.'];
    }
    return $identity;
}

function azurium_request_access(array $config): array
{
    $token = (string) ($_SERVER['HTTP_X_AZURIUM_TOKEN'] ?? '');
    $deviceId = (string) ($_SERVER['HTTP_X_AZURIUM_DEVICE'] ?? '');
    return azurium_validate_bound_access($config, $token, $deviceId);
}
