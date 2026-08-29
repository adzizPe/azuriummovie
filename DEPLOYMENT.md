# Deployment azuriummovie ke cPanel

Website menggunakan PHP sebagai proxy API. Hosting harus mendukung PHP 8.0 atau
lebih baru, Apache `mod_rewrite`, dan ekstensi PHP cURL.

## Berkas yang diunggah

Unggah isi proyek ke document root domain, biasanya `public_html`. Folder
`.git`, `.dev.vars`, dan file konfigurasi lokal tidak perlu diunggah.

Berkas website yang wajib ikut diperbarui:

- `index.html`
- `watch.html`
- `privacy.html`
- `styles.css`
- `app.js`
- `watch.js`
- `access.js`
- `storage.js`
- `pwa.js`
- `sw.js`
- `manifest.webmanifest`
- `ads.txt`
- `.htaccess`
- folder `icons/`
- folder `.well-known/`
- folder `api/` (termasuk `_access.php`, `access/`, `moviebox/`, dan `anime/`)

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
    'ANIME_API_BASE' => 'MASUKKAN_ALAMAT_API_ANIME_DI_SINI',
    'DONGHUA_API_BASE' => 'MASUKKAN_ALAMAT_API_DONGHUA_DI_SINI',
    'IPTV_API_BASE' => 'MASUKKAN_ALAMAT_API_IPTV_DI_SINI',
    'IPTV_STREAM_SECRET' => 'MASUKKAN_STRING_ACAK_PANJANG_DI_SINI',
    'ACCESS_TOKENS' => [
        '0001', '0002', '0003', '0004', '0005',
        '0006', '0007', '0008', '0009', '0010',
        '0011', '0012', '0013', '0014', '0015',
        '0016', '0017', '0018', '0019', '0020',
    ],
    'PLAY_REVIEW_TOKENS' => ['9999'],
];
```

File `.api-config.php` sudah tercantum dalam `.gitignore` dan akses langsungnya
diblokir oleh `.htaccess`. Jangan memasukkannya ke repository atau membagikan
isinya melalui screenshot.

Versi privat yang sudah berisi API dan 20 token pengguna tersedia secara lokal di
`.api-config.php`. Unggah file privat itu secara manual melalui cPanel. Daftar
token pemilik tersedia di `.access-tokens.txt`; file daftar tersebut jangan
diunggah ke `public_html` maupun GitHub.

Saat token pertama kali digunakan, server otomatis membuat
`.access-bindings.json`. Pastikan PHP boleh menulis pada document root. File
tersebut menyimpan hash pengikatan token-perangkat, bukan token mentah, dan
akses langsungnya diblokir oleh `.htaccess`.

Server juga membuat `.access-rate-limit.json` untuk membatasi percobaan token
salah. File ini dibuat otomatis, tidak perlu diunggah, dan tidak boleh masuk
GitHub.

## Pengujian

1. Buka `https://ozancicak.my.id/api/moviebox/movies?page=1` dan
   `https://ozancicak.my.id/api/anime/latest?page=1`. Respons `Token tidak
   valid` atau `Token belum diaktifkan` adalah hasil yang benar karena endpoint
   katalog sekarang dilindungi.
2. Buka `https://ozancicak.my.id/manifest.webmanifest` dan pastikan JSON
   manifest muncul, bukan halaman 404.
3. Buka `https://ozancicak.my.id/privacy.html` dan pastikan kebijakan privasi
   dapat dibaca tanpa memasukkan token.
4. Buka `https://ozancicak.my.id/.well-known/assetlinks.json` dan pastikan JSON
   Digital Asset Links muncul tanpa pengalihan.
5. Buka `https://ozancicak.my.id`, masukkan salah satu token dari daftar privat,
   lalu pastikan katalog muncul.
6. Uji pencarian, halaman detail, pemutar, pilihan resolusi, subtitle, favorit,
   riwayat, lanjut menonton, serta pemilih episode.

Jika respons menyebut ekstensi cURL belum aktif, buka **Select PHP Version >
Extensions**, aktifkan `curl`, lalu simpan.

## Domain dan HTTPS

Arahkan nameserver domain ke nameserver hosting atau buat DNS `A` menuju IP
hosting sesuai petunjuk penyedia cPanel. Setelah DNS aktif, jalankan **SSL/TLS
Status > Run AutoSSL** agar website memakai HTTPS.

## APK Android

APK uji yang sudah dibuat berada di:

Bundle terbaru untuk diunggah ke Google Play Console:

`artifacts/azuriummovie-1.3.4-play.aab`

APK uji lokal terakhir:

`artifacts/azuriummovie-1.3.2-test.apk`

APK ini memakai Trusted Web Activity dan membuka `https://ozancicak.my.id`
secara online, sehingga katalog dan video tidak disalin ke APK. Unggah dahulu
semua berkas website yang disebutkan di atas agar tampilan penuh, service
worker, ikon, dan verifikasi domain tersedia.

Keystore uji berada hanya di komputer lokal pada
`android-twa/azuriummovie.keystore`; kata sandinya tersimpan lokal pada
`android-twa/.signing-password.txt`. Keduanya diabaikan Git. Karena APK 1.2.0
memakai sertifikat uji baru, hapus APK uji versi lama sebelum memasang versi
1.2.0. Jangan memakai
keystore uji untuk publikasi Play Store. Karena identitas Android sekarang
`id.my.azurium.movie`, APK lama perlu dihapus sebelum memasang versi uji 1.3.2.
Untuk rilis produksi, buat keystore
produksi milik sendiri, simpan cadangannya, tanda tangani ulang APK/AAB, lalu
Fingerprint dari JSON Digital Asset Links Google Play sudah ditambahkan ke
`.well-known/assetlinks.json`, termasuk fingerprint kunci klasik dan post-quantum
untuk penandatanganan Quantum-ready. Upload ulang file tersebut ke cPanel.
