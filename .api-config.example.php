<?php

// Salin sebagai .api-config.php di document root melalui cPanel File Manager.
// Jangan commit file .api-config.php yang sudah berisi alamat API sebenarnya.
return [
    'MOVIEBOX_API_BASE' => 'https://alamat-api-anda.example/moviebox',
    'ANIME_API_BASE' => 'https://alamat-api-anda.example/anime',
    'DONGHUA_API_BASE' => 'https://alamat-api-anda.example/donghua',
    'ACCESS_TOKENS' => [
        '0001', '0002', '0003', '0004', '0005',
        '0006', '0007', '0008', '0009', '0010',
        '0011', '0012', '0013', '0014', '0015',
        '0016', '0017', '0018', '0019', '0020',
    ],
    // Token khusus peninjauan Google Play. Token ini tidak diikat ke satu perangkat.
    'PLAY_REVIEW_TOKENS' => ['9999'],
];
