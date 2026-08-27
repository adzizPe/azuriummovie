# Deployment OzancicakMovie ke cPanel

Website menggunakan PHP sebagai proxy API. Hosting harus mendukung PHP 8.0 atau
lebih baru, Apache `mod_rewrite`, dan ekstensi PHP cURL.

## Berkas yang diunggah

Unggah isi proyek ke document root domain, biasanya `public_html`. Folder
`.git`, `.dev.vars`, dan file konfigurasi lokal tidak perlu diunggah.

File Cloudflare berikut boleh tidak diunggah karena tidak digunakan oleh cPanel:

- `functions/`
- `_routes.json`

## Konfigurasi privat

Di cPanel File Manager, aktifkan **Show Hidden Files**, lalu buat file
`.api-config.php` di document root (sefolder dengan `index.html`). Isinya:

```php
<?php
return [
    'MOVIEBOX_API_BASE' => 'MASUKKAN_ALAMAT_API_MOVIEBOX_DI_SINI',
];
```

File `.api-config.php` sudah tercantum dalam `.gitignore` dan akses langsungnya
diblokir oleh `.htaccess`. Jangan memasukkannya ke repository atau membagikan
isinya melalui screenshot.

## Pengujian

1. Buka `https://ozancicak.my.id/api/moviebox/movies?page=1`.
2. Jika JSON muncul, buka `https://ozancicak.my.id`.
3. Uji pencarian, halaman detail, pemutar, pilihan resolusi, dan subtitle.

Jika respons menyebut ekstensi cURL belum aktif, buka **Select PHP Version >
Extensions**, aktifkan `curl`, lalu simpan.

## Domain dan HTTPS

Arahkan nameserver domain ke nameserver hosting atau buat DNS `A` menuju IP
hosting sesuai petunjuk penyedia cPanel. Setelah DNS aktif, jalankan **SSL/TLS
Status > Run AutoSSL** agar website memakai HTTPS.
