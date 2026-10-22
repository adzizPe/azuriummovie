# Upload perbaikan situs — 22 Oktober 2026

Tidak ada jaminan persetujuan AdSense. Katalog/API dan data pribadi tidak dihapus.
Beranda domain kini menyajikan panduan publik melalui DirectoryIndex Apache.
Katalog lama tetap di /index.html, termasuk token, kategori, dan pemutar.
Tidak ada pembedaan tampilan antara pemeriksa Google dan pengunjung biasa.

## Sebelum upload

1. Di cPanel > Domains, catat Document Root ozancicak.my.id. Jangan menebak public_html.
2. Backup file hosting dan download ke komputer. Simpan rahasia/binding server secara privat.
3. Pastikan email support@ozancicak.my.id yang tercantum di situs benar-benar aktif: buat mailbox atau forwarder dan tes kirim/terima. Jika bukan alamat yang digunakan, ubah tautannya di privacy.html dan tentang.html sebelum upload.
4. Periksa CONTENT-RIGHTS.md. Izin sumber belum terbukti; kumpulkan bukti dari penyedia. Artikel baru dan pembatasan iklan tidak menyelesaikan persoalan hak distribusi.

## File pembaruan (hosting sudah berisi proyek sebelumnya)

Upload seluruh file berikut ke Document Root, timpa versi lama setelah backup:

```
.htaccess
index.html
watch.html
live.html
privacy.html
panduan.html
tentang.html
styles.css
access.js
sw.js
editorial-ads.js
sitemap.xml
robots.txt
ads.txt
```

1. Buat ZIP dengan file langsung di tingkat teratas, bukan di dalam folder proyek.
2. File Manager > Settings > Show Hidden Files; pastikan .htaccess ikut.
3. Upload ZIP, lalu Extract ke Document Root.
4. Jangan mengubah .api-config.php atau file binding/rate-limit yang sudah ada di server.
5. Hapus ZIP dari hosting setelah selesai. Jangan meninggalkan backup publik.

## Jika hosting benar-benar kosong

Selain daftar di atas, upload app.js, watch.js, live.js, storage.js, pwa.js,
manifest.webmanifest, seluruh icons/, api/ beserta .htaccess-nya, dan .well-known/.
Upload .api-config.php asli secara terpisah ke Document Root, jangan versi contoh.
Gunakan PHP dengan cURL. Tidak perlu Node.js/npm di hosting.
Jangan upload .git/, node_modules/, android-twa/, artifacts/, daftar token,
keystore, file .env, dokumentasi lokal, atau binding/rate-limit lokal.
Pastikan DNS menuju hosting baru dan SSL domain aktif.

## Pemeriksaan wajib setelah upload

- Buka domain utama dalam jendela privat: harus langsung tampil panduan, tanpa token.
- /panduan.html dan /tentang.html harus terbuka, juga saat JavaScript dimatikan.
- /index.html tetap membuka katalog; tes token, pencarian, favorit dan satu video.
- Coba tombol Kembali dari pemutar. Koleksi yang tersimpan di perangkat tidak perlu dihapus.
- /privacy.html, /robots.txt, /sitemap.xml, /ads.txt dan /.well-known/assetlinks.json harus tersedia.
- /.api-config.php harus ditolak. Jangan salin isinya ke screenshot publik.
- Refresh Ctrl+F5. Tutup dan buka ulang aplikasi agar service worker baru aktif; jangan hapus data aplikasi karena favorit/riwayat tersimpan lokal.
- Jika / masih membuka katalog: cek .htaccess sudah terganti dan DirectoryIndex tidak ditimpa konfigurasi hosting. Hubungi hosting bila directive tidak didukung.
- Pada Network browser: halaman katalog/pemutar tidak boleh meminta adsbygoogle.js. Panduan online boleh memuatnya; keberadaan skrip bukan bukti iklan telah disetujui.
- Submit sitemap.xml melalui Search Console bila digunakan. Ini bukan jaminan persetujuan.

## Sebelum meminta peninjauan lagi

Periksa versi online, seluruh tautan, kontak aktif, dan bukti izin konten. Jangan
mengonfirmasi semua masalah selesai jika hal tersebut belum diperiksa. Kembangkan
konten berdasarkan kebutuhan pembaca nyata; tidak ada angka jumlah artikel atau
panjang tulisan dalam proyek ini yang menjamin lolos. Jangan membuat ulasan palsu.
Kebijakan: https://support.google.com/publisherpolicies/answer/10502938

Audit online melalui alat penelusuran pada 22 Oktober 2026 gagal mengakses domain;
ini bukan bukti pasti situs mati atau alasan penolakan Google. Periksa langsung
dari browser dan hosting setelah upload.
