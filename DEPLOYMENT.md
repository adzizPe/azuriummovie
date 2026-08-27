# Deployment OzancicakMovie ke cPanel

Website menggunakan PHP sebagai proxy API. Hosting harus mendukung PHP 8.0 atau
lebih baru, Apache `mod_rewrite`, dan ekstensi PHP cURL.

## Berkas yang diunggah

Unggah isi proyek ke document root domain, biasanya `public_html`. Folder
`.git`, `.dev.vars`, dan file konfigurasi lokal tidak perlu diunggah.

Berkas website yang wajib ikut diperbarui:

- `index.html`
- `watch.html`
- `styles.css`
- `app.js`
- `watch.js`
- `access.js`
- `storage.js`
- `pwa.js`
- `sw.js`
- `manifest.webmanifest`
- `.htaccess`
- folder `icons/`
- folder `.well-known/`
- folder `api/` (termasuk `_access.php`, `access/`, dan `moviebox/`)

File Cloudflare berikut boleh tidak diunggah karena tidak digunakan oleh cPanel:

- `functions/`
- `_routes.json`

Folder berikut juga bukan bagian website cPanel dan tidak perlu diunggah ke
`public_html`:

- `android-twa/` (kode sumber pembungkus Android)
- `artifacts/` (hasil APK lokal)

## Konfigurasi privat

Di cPanel File Manager, aktifkan **Show Hidden Files**, lalu buat file
`.api-config.php` di document root (sefolder dengan `index.html`). Isinya:

```php
<?php
return [
    'MOVIEBOX_API_BASE' => 'MASUKKAN_ALAMAT_API_MOVIEBOX_DI_SINI',
    'ACCESS_TOKENS' => [
        'TOKEN-01', 'TOKEN-02', 'TOKEN-03', 'TOKEN-04', 'TOKEN-05',
        'TOKEN-06', 'TOKEN-07', 'TOKEN-08', 'TOKEN-09', 'TOKEN-10',
    ],
];
```

File `.api-config.php` sudah tercantum dalam `.gitignore` dan akses langsungnya
diblokir oleh `.htaccess`. Jangan memasukkannya ke repository atau membagikan
isinya melalui screenshot.

Versi privat yang sudah berisi API dan 10 token tersedia secara lokal di
`.api-config.php`. Unggah file privat itu secara manual melalui cPanel. Daftar
token pemilik tersedia di `.access-tokens.txt`; file daftar tersebut jangan
diunggah ke `public_html` maupun GitHub.

Saat token pertama kali digunakan, server otomatis membuat
`.access-bindings.json`. Pastikan PHP boleh menulis pada document root. File
tersebut menyimpan hash pengikatan token-perangkat, bukan token mentah, dan
akses langsungnya diblokir oleh `.htaccess`.

## Pengujian

1. Buka `https://ozancicak.my.id/api/moviebox/movies?page=1`. Respons `Token
   tidak valid` atau `Token belum diaktifkan` adalah hasil yang benar karena
   endpoint katalog sekarang dilindungi.
2. Buka `https://ozancicak.my.id/manifest.webmanifest` dan pastikan JSON
   manifest muncul, bukan halaman 404.
3. Buka `https://ozancicak.my.id/.well-known/assetlinks.json` dan pastikan JSON
   Digital Asset Links muncul tanpa pengalihan.
4. Buka `https://ozancicak.my.id`, masukkan salah satu token dari daftar privat,
   lalu pastikan katalog muncul.
5. Uji pencarian, halaman detail, pemutar, pilihan resolusi, subtitle, favorit,
   riwayat, lanjut menonton, serta pemilih episode.

Jika respons menyebut ekstensi cURL belum aktif, buka **Select PHP Version >
Extensions**, aktifkan `curl`, lalu simpan.

## Domain dan HTTPS

Arahkan nameserver domain ke nameserver hosting atau buat DNS `A` menuju IP
hosting sesuai petunjuk penyedia cPanel. Setelah DNS aktif, jalankan **SSL/TLS
Status > Run AutoSSL** agar website memakai HTTPS.

## APK Android

APK uji yang sudah dibuat berada di:

`artifacts/OzancicakMovie-1.1.0-test.apk`

APK ini memakai Trusted Web Activity dan membuka `https://ozancicak.my.id`
secara online, sehingga katalog dan video tidak disalin ke APK. Unggah dahulu
semua berkas website yang disebutkan di atas agar tampilan penuh, service
worker, ikon, dan verifikasi domain tersedia.

Keystore uji berada hanya di komputer lokal pada
`android-twa/ozancicakmovie.keystore` dan diabaikan Git. Jangan memakai
keystore uji untuk publikasi Play Store. Untuk rilis produksi, buat keystore
produksi milik sendiri, simpan cadangannya, tanda tangani ulang APK/AAB, lalu
tambahkan fingerprint SHA-256 produksi ke `.well-known/assetlinks.json`.
