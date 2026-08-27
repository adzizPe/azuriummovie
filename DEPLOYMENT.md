# Deployment OzancicakMovie

Website ini disiapkan untuk Cloudflare Pages dengan custom domain `ozancicak.my.id`.

## Konfigurasi Pages

- Framework preset: `None`
- Production branch: `main`
- Build command: `exit 0`
- Build output directory: `.`
- Root directory: kosongkan

## Secret yang wajib diatur

Di Cloudflare Pages, buka **Settings > Variables and Secrets**, kemudian buat secret:

```text
MOVIEBOX_API_BASE
```

Masukkan alamat upstream hanya melalui dashboard Cloudflare. Jangan menuliskan nilainya di repository, `.env`, dokumentasi, commit, atau screenshot publik.

Atur secret yang sama untuk environment **Production** dan **Preview** jika preview deployment juga harus dapat mengambil film.

## Custom domain

Setelah deployment pertama berhasil, buka **Custom domains > Set up a domain**, lalu masukkan:

```text
ozancicak.my.id
```

Ikuti instruksi nameserver/DNS dari Cloudflare. Setelah domain aktif, arahkan alamat `*.pages.dev` ke `https://ozancicak.my.id` dengan Bulk Redirect `301` agar pengunjung selalu menggunakan domain utama.

## Pengembangan lokal

Gunakan Wrangler Pages, bukan Live Server biasa, karena route `/api/moviebox/*` memerlukan Pages Functions:

```text
npx wrangler pages dev .
```

Buat `.dev.vars` lokal berisi `MOVIEBOX_API_BASE`, tetapi jangan pernah memasukkan file tersebut ke Git. File itu sudah dilindungi oleh `.gitignore`.
