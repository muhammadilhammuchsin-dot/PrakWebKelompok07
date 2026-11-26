# E-Perpustakaan Universitas Khairun — Kelompok 07

Aplikasi web PHP + MySQL dengan halaman **anggota**, **pustakawan**, dan **kepala perpustakaan**. Fitur aktif mencakup autentikasi berbasis session, katalog dan pencarian buku, klasifikasi minat baca KNN, pengelolaan buku/anggota, peminjaman/pengembalian, laporan, serta pemulihan password via email.

## Menjalankan dengan XAMPP

1. Ekstrak ZIP ke `C:\xampp\htdocs\` sehingga struktur folder menjadi `C:\xampp\htdocs\PrakWebKelompok07\frontend`, `backend`, dan `vendor`. Jangan menaruh folder proyek di dalam folder proyek lain.
2. Jalankan **Apache** dan **MySQL** pada XAMPP.
3. Pastikan database MySQL yang sudah ada di phpMyAdmin bernama `e_perpustakaan`. ZIP ini **tidak** berisi export SQL karena database pengguna sudah disiapkan terpisah.
4. Sesuaikan kredensial jika MySQL tidak menggunakan default XAMPP, melalui environment variables `DB_HOST`, `DB_NAME`, `DB_USER`, dan `DB_PASS`. Konfigurasi dibaca di `backend/config/database.php`.
5. Buka `http://localhost/PrakWebKelompok07/frontend/` (dialihkan otomatis) atau `http://localhost/PrakWebKelompok07/frontend/html/auth/login/anggota.html`. Gunakan Apache/XAMPP, bukan Live Server.

## Struktur

- `frontend/html/`: seluruh halaman HTML, dikelompokkan berdasarkan peran.
- `frontend/css/`: stylesheet; `frontend/js/`: JavaScript; `frontend/assets/`: gambar sampul.
- `frontend/index.php`: pengalihan dari URL lama `/frontend/` ke halaman login anggota.
- `backend/`: API PHP, PDO, autentikasi, transaksi, serta laporan.
- `vendor/`: PHPMailer dan autoloader Composer untuk email OTP; jangan dihapus.
- `composer.json` / `composer.lock`: dependensi PHP.

## Catatan pembersihan

Pemanggilan script ganda di halaman pustakawan dihapus; dua modul autentikasi lama yang tidak dipanggil dikeluarkan; script yang tidak diperlukan di beranda anggota dihapus. Komentar panjang dan baris kosong pada kode aplikasi diringkas. Halaman kategori, file PHP aktif, dan aset sampul tetap dipertahankan untuk mencegah regresi. CSS Buku Terbaru kini terpusat di `frontend/css/anggota/beranda-anggota.css`, aturan responsif anggota tidak lagi menimpa `shared/responsive.css`, dan urutan stylesheet seluruh halaman pencarian diseragamkan. Pada CSS laporan Kepus, hanya deklarasi dasar yang pasti tertimpa yang dihapus; pengaturan viewport dan breakpoint tetap dipertahankan. Konfigurasi database yang sudah digunakan tidak diubah.

**Keamanan:** file `backend/config/mail.php` pada proyek sumber memuat kredensial SMTP. Sebelum mempublikasikan atau membagikan ZIP lebih luas, cabut/rotasi App Password yang pernah terekspos dan pindahkan pengaturan rahasia ke environment variables. Untuk produksi, gunakan akun MySQL khusus dengan hak akses minimum.

**Verifikasi:** pemeriksaan sintaks dan referensi file bukan pengganti uji login, CRUD, transaksi, KNN, laporan, dan email dengan database MySQL serta SMTP nyata.

## Lokasi HTML setelah penataan

- Anggota: `frontend/html/anggota/`
- Login/daftar/lupa password: `frontend/html/auth/`
- Pustakawan: `frontend/html/pustakawan/`
- Kepala perpustakaan: `frontend/html/kepus/`

Semua path stylesheet, JavaScript, sampul, dan pemeriksaan sesi sudah disesuaikan dengan folder baru. Bookmark lama yang mengarah langsung ke `/frontend/anggota/*.html` atau folder peran lama perlu diperbarui.
