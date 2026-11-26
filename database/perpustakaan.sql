CREATE DATABASE IF NOT EXISTS `e_perpustakaan`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE `e_perpustakaan`;
SET NAMES utf8mb4;

-- PERSIAPAN TRIGGER
-- Tidak menghapus tabel atau data yang sudah ada.
-- Gunakan database baru/kosong untuk instalasi pertama.
DROP TRIGGER IF EXISTS `trg_transaksi_peminjaman_before_insert`;
DROP TRIGGER IF EXISTS `trg_transaksi_peminjaman_after_insert`;
DROP TRIGGER IF EXISTS `trg_transaksi_peminjaman_before_update`;
DROP TRIGGER IF EXISTS `trg_transaksi_peminjaman_after_update`;
DROP TRIGGER IF EXISTS `trg_transaksi_peminjaman_before_delete`;
DROP TRIGGER IF EXISTS `trg_buku_before_insert`;
DROP TRIGGER IF EXISTS `trg_buku_before_update`;

-- 1. JENIS PENGGUNA
-- Menyimpan jenis hak akses pengguna.
CREATE TABLE `jenis_pengguna` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_code` VARCHAR(40) NOT NULL,
  `role_name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_role_code` (`role_code`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `jenis_pengguna`
(`role_code`, `role_name`, `description`) VALUES
('anggota', 'Anggota', 'Pengguna perpustakaan'),
('pustakawan', 'Pustakawan', 'Petugas pengelola perpustakaan'),
('kepus', 'Kepala Perpustakaan', 'Pengelola dan pemantau perpustakaan');

-- 2. AKUN PENGGUNA
-- Menyimpan akun login dan autentikasi seluruh pengguna.
-- Password disimpan dalam bentuk hash.
CREATE TABLE `akun_pengguna` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_id` BIGINT UNSIGNED NOT NULL,
  `login_identifier` VARCHAR(100) NOT NULL,
  `email` VARCHAR(190) DEFAULT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `account_status` ENUM('active','inactive','blocked') NOT NULL DEFAULT 'active',
  `last_login_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_login_identifier` (`login_identifier`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_akun_pengguna_jenis` (`role_id`),
  CONSTRAINT `fk_akun_pengguna_jenis`
    FOREIGN KEY (`role_id`)
    REFERENCES `jenis_pengguna` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. PROFIL ANGGOTA
-- Menyimpan identitas dan informasi anggota perpustakaan.
CREATE TABLE `profil_anggota` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `npm` VARCHAR(40) NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `faculty` VARCHAR(150) DEFAULT NULL,
  `study_program` VARCHAR(150) DEFAULT NULL,
  `entry_year` YEAR DEFAULT NULL,
  `phone` VARCHAR(30) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_anggota_npm` (`npm`),
  CONSTRAINT `fk_profil_anggota_akun`
    FOREIGN KEY (`user_id`)
    REFERENCES `akun_pengguna` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. PROFIL PETUGAS PERPUSTAKAAN
-- Menyimpan profil pustakawan dan kepala perpustakaan.
CREATE TABLE `profil_petugas_perpustakaan` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `nip` VARCHAR(40) NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `position_title` VARCHAR(120) DEFAULT NULL,
  `phone` VARCHAR(30) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_staff_nip` (`nip`),
  CONSTRAINT `fk_profil_petugas_akun`
    FOREIGN KEY (`user_id`)
    REFERENCES `akun_pengguna` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. KATEGORI BUKU
-- Menyimpan kategori buku perpustakaan.
CREATE TABLE `kategori_buku` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_name` VARCHAR(120) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categories_name` (`category_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. PENULIS BUKU
-- Menyimpan informasi penulis buku.
CREATE TABLE `penulis_buku` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `author_name` VARCHAR(150) NOT NULL,
  `biography` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_authors_name` (`author_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. BUKU
-- Menyimpan katalog, informasi, dan stok buku.
CREATE TABLE `buku` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `book_code` VARCHAR(50) NOT NULL,
  `isbn` VARCHAR(30) DEFAULT NULL,
  `title` VARCHAR(255) NOT NULL,
  `category_id` BIGINT UNSIGNED DEFAULT NULL,
  `publisher` VARCHAR(150) DEFAULT NULL,
  `publication_year` YEAR DEFAULT NULL,
  `edition` VARCHAR(60) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `cover_path` VARCHAR(255) DEFAULT NULL,
  `shelf_location` VARCHAR(80) DEFAULT NULL,
  `total_stock` INT UNSIGNED NOT NULL DEFAULT 0,
  `available_stock` INT UNSIGNED NOT NULL DEFAULT 0,
  `book_status` ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_books_book_code` (`book_code`),
  UNIQUE KEY `uq_books_isbn` (`isbn`),
  KEY `idx_buku_judul` (`title`),
  KEY `idx_buku_kategori` (`category_id`),
  KEY `idx_buku_status` (`book_status`),
  CONSTRAINT `fk_buku_kategori`
    FOREIGN KEY (`category_id`)
    REFERENCES `kategori_buku` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. BUKU PENULIS
-- Menghubungkan buku dengan penulisnya.
-- Mendukung satu buku memiliki beberapa penulis.
CREATE TABLE `buku_penulis` (
  `book_id` BIGINT UNSIGNED NOT NULL,
  `author_id` BIGINT UNSIGNED NOT NULL,
  `author_order` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`book_id`, `author_id`),
  KEY `idx_buku_penulis_penulis` (`author_id`),
  CONSTRAINT `fk_buku_penulis_buku`
    FOREIGN KEY (`book_id`)
    REFERENCES `buku` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT `fk_buku_penulis_penulis`
    FOREIGN KEY (`author_id`)
    REFERENCES `penulis_buku` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. TRANSAKSI PEMINJAMAN
-- Satu transaksi hanya berisi satu buku.
-- Peminjaman langsung tercatat tanpa persetujuan manual.
CREATE TABLE `transaksi_peminjaman` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `loan_code` VARCHAR(50) NOT NULL,
  `member_user_id` BIGINT UNSIGNED NOT NULL,
  `book_id` BIGINT UNSIGNED NOT NULL,
  `loan_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `due_date` DATE NOT NULL,
  `returned_at` DATETIME DEFAULT NULL,
  `status` ENUM('borrowed','returned') NOT NULL DEFAULT 'borrowed',
  `notes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_loan_code` (`loan_code`),
  KEY `idx_transaksi_anggota` (`member_user_id`),
  KEY `idx_transaksi_buku` (`book_id`),
  KEY `idx_transaksi_status_jatuh_tempo` (`status`, `due_date`),
  KEY `idx_transaksi_tanggal` (`loan_date`),
  CONSTRAINT `fk_transaksi_peminjaman_anggota`
    FOREIGN KEY (`member_user_id`)
    REFERENCES `profil_anggota` (`user_id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT `fk_transaksi_peminjaman_buku`
    FOREIGN KEY (`book_id`)
    REFERENCES `buku` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. RIWAYAT PERUBAHAN STOK
-- Mencatat stok masuk, stok keluar, dan penyesuaian stok.
CREATE TABLE `riwayat_perubahan_stok` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `book_id` BIGINT UNSIGNED NOT NULL,
  `loan_transaction_id` BIGINT UNSIGNED DEFAULT NULL,
  `movement_type` ENUM('IN','OUT','ADJUSTMENT') NOT NULL,
  `quantity` INT UNSIGNED NOT NULL,
  `notes` VARCHAR(255) DEFAULT NULL,
  `created_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_riwayat_stok_buku_tanggal` (`book_id`, `created_at`),
  KEY `idx_riwayat_stok_transaksi` (`loan_transaction_id`),
  KEY `idx_riwayat_stok_petugas` (`created_by_user_id`),
  CONSTRAINT `fk_riwayat_stok_buku`
    FOREIGN KEY (`book_id`)
    REFERENCES `buku` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT `fk_riwayat_stok_transaksi`
    FOREIGN KEY (`loan_transaction_id`)
    REFERENCES `transaksi_peminjaman` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT `fk_riwayat_stok_pengguna`
    FOREIGN KEY (`created_by_user_id`)
    REFERENCES `akun_pengguna` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. RIWAYAT PENCARIAN BUKU
-- Menyimpan aktivitas pencarian buku oleh anggota.
-- Digunakan untuk analisis minat baca dan rekomendasi.
CREATE TABLE `riwayat_pencarian_buku` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `member_user_id` BIGINT UNSIGNED NOT NULL,
  `keyword` VARCHAR(255) NOT NULL,
  `category_id` BIGINT UNSIGNED DEFAULT NULL,
  `searched_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_riwayat_pencarian_anggota_tanggal` (`member_user_id`, `searched_at`),
  KEY `idx_riwayat_pencarian_kategori` (`category_id`),
  CONSTRAINT `fk_riwayat_pencarian_anggota`
    FOREIGN KEY (`member_user_id`)
    REFERENCES `profil_anggota` (`user_id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT `fk_riwayat_pencarian_kategori`
    FOREIGN KEY (`category_id`)
    REFERENCES `kategori_buku` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. TOKEN RESET KATA SANDI
-- Menyimpan token pemulihan kata sandi dalam bentuk hash.
CREATE TABLE `token_reset_kata_sandi` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `used_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_password_reset_token_hash` (`token_hash`),
  KEY `idx_token_reset_akun_kedaluwarsa` (`user_id`, `expires_at`),
  CONSTRAINT `fk_token_reset_akun`
    FOREIGN KEY (`user_id`)
    REFERENCES `akun_pengguna` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
-- VALIDASI STOK SAAT MENAMBAHKAN BUKU
CREATE TRIGGER `trg_buku_before_insert`
BEFORE INSERT ON `buku`
FOR EACH ROW
BEGIN
  IF NEW.available_stock > NEW.total_stock THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stok tersedia tidak boleh melebihi total stok.';
  END IF;
END$$

-- VALIDASI STOK SAAT MENGUBAH DATA BUKU
CREATE TRIGGER `trg_buku_before_update`
BEFORE UPDATE ON `buku`
FOR EACH ROW
BEGIN
  IF NEW.available_stock > NEW.total_stock THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stok tersedia tidak boleh melebihi total stok.';
  END IF;
END$$

-- VALIDASI PEMINJAMAN SEBELUM TRANSAKSI DIBUAT
CREATE TRIGGER `trg_transaksi_peminjaman_before_insert`
BEFORE INSERT ON `transaksi_peminjaman`
FOR EACH ROW
BEGIN
  DECLARE v_available_stock INT UNSIGNED DEFAULT 0;
  IF NEW.status <> 'borrowed' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Peminjaman baru harus berstatus borrowed.';
  END IF;
  SELECT `available_stock`
    INTO v_available_stock
    FROM `buku`
    WHERE `id` = NEW.book_id
    FOR UPDATE;
  IF v_available_stock < 1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Stok buku tidak tersedia.';
  END IF;
END$$

-- OTOMATIS MENGURANGI STOK SETELAH PEMINJAMAN
CREATE TRIGGER `trg_transaksi_peminjaman_after_insert`
AFTER INSERT ON `transaksi_peminjaman`
FOR EACH ROW
BEGIN
  UPDATE `buku`
    SET `available_stock` = `available_stock` - 1
    WHERE `id` = NEW.book_id;

  INSERT INTO `riwayat_perubahan_stok`
    (`book_id`, `loan_transaction_id`, `movement_type`, `quantity`, `notes`)
  VALUES
    (
      NEW.book_id,
      NEW.id,
      'OUT',
      1,
      'Stok keluar otomatis karena peminjaman'
    );
END$$

-- VALIDASI PERUBAHAN TRANSAKSI
CREATE TRIGGER `trg_transaksi_peminjaman_before_update`
BEFORE UPDATE ON `transaksi_peminjaman`
FOR EACH ROW
BEGIN
  IF NEW.book_id <> OLD.book_id
     OR NEW.member_user_id <> OLD.member_user_id THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Buku dan anggota pada transaksi tidak boleh diganti.';
  END IF;
  IF OLD.status = 'returned'
     AND NEW.status <> 'returned' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Transaksi yang sudah dikembalikan tidak dapat diaktifkan kembali.';
  END IF;
  IF OLD.status = 'borrowed'
     AND NEW.status = 'returned' THEN
    SET NEW.returned_at = COALESCE(NEW.returned_at, CURRENT_TIMESTAMP);
  END IF;
END$$

-- OTOMATIS MENAMBAH STOK SETELAH PENGEMBALIAN
CREATE TRIGGER `trg_transaksi_peminjaman_after_update`
AFTER UPDATE ON `transaksi_peminjaman`
FOR EACH ROW
BEGIN
  IF OLD.status = 'borrowed'
     AND NEW.status = 'returned' THEN

    UPDATE `buku`
      SET `available_stock` =
        LEAST(`total_stock`, `available_stock` + 1)
      WHERE `id` = NEW.book_id;

    INSERT INTO `riwayat_perubahan_stok`
      (`book_id`, `loan_transaction_id`, `movement_type`, `quantity`, `notes`)
    VALUES
      (
        NEW.book_id,
        NEW.id,
        'IN',
        1,
        'Stok masuk otomatis karena pengembalian'
      );
  END IF;
END$$

-- MENCEGAH PENGHAPUSAN RIWAYAT TRANSAKSI
CREATE TRIGGER `trg_transaksi_peminjaman_before_delete`
BEFORE DELETE ON `transaksi_peminjaman`
FOR EACH ROW
BEGIN

  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Transaksi peminjaman tidak boleh dihapus; simpan sebagai riwayat.';

END$$
DELIMITER ;
