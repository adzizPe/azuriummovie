# Checklist Upload cPanel azuriummovie

Dokumen ini menjadi daftar utama setiap kali website diperbarui. Upload ke
**document root** domain `ozancicak.my.id` (biasanya `public_html`, tetapi ikuti
document root yang terlihat di menu Domains cPanel).

> Aktifkan **Show Hidden Files** di File Manager agar file `.htaccess`, folder
> `.well-known`, dan `.api-config.php` terlihat.

## 1. Wajib di-upload ke cPanel

Pertahankan nama dan susunan folder seperti di proyek lokal.

### Halaman website

- [ ] `index.html`
- [ ] `watch.html`
- [ ] `privacy.html`

### Tampilan dan JavaScript

- [ ] `styles.css`
- [ ] `access.js`
- [ ] `app.js`
- [ ] `watch.js`
- [ ] `storage.js`
- [ ] `pwa.js`
- [ ] `sw.js`

Jika salah satu file CSS/JavaScript berubah, upload juga HTML dan `sw.js`
terbaru agar nomor versi cache tetap cocok.

### PWA, iklan, dan konfigurasi web

- [ ] `manifest.webmanifest`
- [ ] `ads.txt`
- [ ] `.htaccess`

### Ikon website/PWA

Cara paling mudah adalah upload seluruh folder `icons/`. File yang sedang
dipakai website adalah:

- [ ] `icons/launchericon-48x48.png`
- [ ] `icons/launchericon-96x96.png`
- [ ] `icons/launchericon-192x192.png`
- [ ] `icons/launchericon-512x512.png`

### Digital Asset Links Android

- [ ] `.well-known/assetlinks.json`

Fingerprint dari bagian **JSON Digital Asset Links** Google Play sudah ditambahkan.
Fingerprint kunci klasik dan post-quantum untuk penandatanganan Quantum-ready
juga sudah ditambahkan. Jangan menghapus fingerprint yang masih digunakan.

### Proxy PHP

Upload seluruh folder `api/` beserta file tersembunyinya:

- [ ] `api/_access.php`
- [ ] `api/access/index.php`
- [ ] `api/moviebox/index.php`
- [ ] `api/moviebox/.htaccess`
- [ ] `api/anime/index.php`
- [ ] `api/anime/.htaccess`
- [ ] `api/translate/index.php`

## 2. Wajib ada di cPanel, tetapi bersifat rahasia

- [ ] `.api-config.php`

File ini harus berada di document root, satu folder dengan `index.html`.
Upload secara manual melalui cPanel dan pastikan isinya memuat:

- `MOVIEBOX_API_BASE`
- `ANIME_API_BASE`
- `ACCESS_TOKENS`
- `PLAY_REVIEW_TOKENS` (khusus peninjau Google Play dan tidak diikat ke satu perangkat)

Aturan penting:

- Jangan masukkan `.api-config.php` ke GitHub.
- Jangan kirim isinya melalui screenshot atau chat publik.
- Pastikan `.htaccess` terbaru ikut di-upload agar akses langsung diblokir.
- Gunakan permission `600` atau `640` jika hosting mengizinkannya.

## 3. Jangan di-upload ke cPanel/public_html

### Rahasia dan data lokal

- [ ] Jangan upload `.access-tokens.txt`
- [ ] Jangan upload `.dev.vars`
- [ ] Jangan upload file `.env` apa pun
- [ ] Jangan upload keystore: `*.keystore` atau `*.jks`
- [ ] Jangan upload `android-twa/.signing-password.txt`

### Dibuat otomatis oleh server

- [ ] Jangan upload `.access-bindings.json`
- [ ] Jangan upload `.access-rate-limit.json`

Kedua file tersebut akan dibuat oleh PHP. Pastikan document root dapat ditulis
oleh PHP. Jangan menyalin versi lokal karena dapat membawa pengikatan perangkat
atau pembatasan percobaan yang sudah lama.

### Kode/platform yang tidak dipakai cPanel

- [ ] Jangan upload folder `functions/` (khusus Cloudflare Pages)
- [ ] Jangan upload `_routes.json` (khusus Cloudflare Pages)
- [ ] Jangan upload folder `android-twa/` (kode sumber Android)
- [ ] Jangan upload folder `artifacts/` (APK/AAB lokal)

### File pengembangan dan dokumentasi

- [ ] Jangan upload folder `.git/`
- [ ] Jangan upload `.gitignore`
- [ ] Jangan upload folder `.vscode/` atau `.idea/`
- [ ] Jangan upload `node_modules/`
- [ ] Tidak perlu upload `.api-config.example.php`
- [ ] Tidak perlu upload `DEPLOYMENT.md`
- [ ] Tidak perlu upload `CPANEL-CHECKLIST.md`
- [ ] Jangan upload file log, `Thumbs.db`, atau `.DS_Store`

## 4. File ikon yang tidak wajib untuk website

File berikut boleh tetap disimpan lokal karena hanya sumber/master atau ukuran
launcher Android yang tidak dipanggil website secara langsung:

- `icons/logobaru1024x1024.png`
- `icons/launchericon-72x72.png`
- `icons/launchericon-144x144.png`
- `icons/icon-192.png` dan `icons/icon-512.png` lama

Mengupload seluruh folder `icons/` tetap aman, tetapi file di atas tidak wajib.

## 5. Pemeriksaan setelah upload

- [ ] `https://ozancicak.my.id/` membuka halaman utama.
- [ ] `https://ozancicak.my.id/privacy.html` terbuka tanpa token.
- [ ] `https://ozancicak.my.id/manifest.webmanifest` menampilkan JSON.
- [ ] `https://ozancicak.my.id/ads.txt` menampilkan data publisher.
- [ ] `https://ozancicak.my.id/.well-known/assetlinks.json` menampilkan JSON tanpa pengalihan.
- [ ] Logo baru terlihat; jika masih lama, refresh dengan `Ctrl + F5`.
- [ ] Token dapat digunakan dan katalog berhasil dimuat.
- [ ] Pencarian, detail, video, kualitas, subtitle, episode, favorit, riwayat, dan lanjut menonton berfungsi.
- [ ] `https://ozancicak.my.id/.api-config.php` tidak dapat dibuka oleh publik.

## Ringkasan cepat

**Upload:** HTML + CSS + JS + `sw.js` + manifest + `ads.txt` + `.htaccess` +
ikon aktif + `.well-known/` + `api/` + `.api-config.php` privat.

**Jangan upload:** token list, binding/rate-limit lokal, secret Cloudflare,
keystore, source Android, APK/AAB, Git, editor, dependencies, dan dokumentasi.
