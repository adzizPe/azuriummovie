# Android OzancicakMovie

Folder ini berisi pembungkus Android Trusted Web Activity (TWA) untuk
`https://ozancicak.my.id`. Aplikasi tidak menyimpan katalog, poster, subtitle,
atau video di dalam APK; seluruh data tetap dimuat online melalui website dan
proxy `/api/moviebox`.

## Hasil build lokal

APK uji yang siap dipasang:

`../artifacts/OzancicakMovie-1.0.0-test.apk`

APK dan keystore sengaja diabaikan Git. Kode sumber Android, konfigurasi TWA,
PWA, dan Digital Asset Links tetap boleh masuk repository publik karena tidak
berisi alamat upstream API maupun konfigurasi privat cPanel.

## Sebelum memasang APK

Unggah semua perubahan website ke document root cPanel, terutama:

- `manifest.webmanifest`, `sw.js`, dan `pwa.js`
- folder `icons/`
- folder `.well-known/`
- HTML, CSS, JavaScript, serta proxy PHP terbaru

Pastikan URL berikut memberi respons `200`:

- `https://ozancicak.my.id/manifest.webmanifest`
- `https://ozancicak.my.id/.well-known/assetlinks.json`

## Rilis produksi

Build saat ini memakai sertifikat pengujian. Untuk Play Store atau distribusi
jangka panjang, buat keystore produksi sendiri, simpan cadangannya dengan aman,
tanda tangani APK/AAB menggunakan kunci tersebut, dan tambahkan fingerprint
SHA-256 produksi ke `.well-known/assetlinks.json`.
