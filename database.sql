-- ============================================================
-- CareerBridge – Database schema (Module M1: User Management & Auth)
-- Target: MySQL 8.0.16+ (InnoDB, utf8mb4)
-- Covers: US-01/02 registration, US-03 login + lock-out,
--         US-04 password reset, US-21 employer approval, admin role.
-- ============================================================
 
CREATE DATABASE IF NOT EXISTS careerbridge
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
USE careerbridge;
 
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS user_sessions, password_resets, login_attempts, employer_profiles, users, industries;
SET FOREIGN_KEY_CHECKS = 1;
 
-- ------------------------------------------------------------
-- Lookup: industries (the options in register.html's dropdown)
-- ------------------------------------------------------------
CREATE TABLE industries (
  id    SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name  VARCHAR(80)       NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_industries_name (name)
) ENGINE=InnoDB;
 
-- ------------------------------------------------------------
-- users: one row per account (seeker, employer or admin)
-- ------------------------------------------------------------
CREATE TABLE users (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role           ENUM('seeker','employer','admin') NOT NULL,
  name           VARCHAR(100)  NOT NULL,
  email          VARCHAR(255)  NOT NULL,               -- store lower-cased and trimmed
  password_hash  VARCHAR(255)  NOT NULL,               -- bcrypt / argon2 hash, never plain text
  status         ENUM('active','pending','suspended') NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_status (role, status),            -- admin lists: "pending employers" etc.
  CONSTRAINT chk_users_name_len  CHECK (CHAR_LENGTH(name) >= 3),
  CONSTRAINT chk_users_email_lc  CHECK (email = LOWER(email))
) ENGINE=InnoDB;
 
-- ------------------------------------------------------------
-- employer_profiles: extra fields only employers have (1:1 with users)
-- ------------------------------------------------------------
CREATE TABLE employer_profiles (
  user_id      BIGINT UNSIGNED   NOT NULL,
  company_name VARCHAR(150)      NOT NULL,
  industry_id  SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id),
  KEY idx_employer_company (company_name),
  CONSTRAINT fk_employer_user     FOREIGN KEY (user_id)     REFERENCES users(id)      ON DELETE CASCADE,
  CONSTRAINT fk_employer_industry FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE RESTRICT,
  CONSTRAINT chk_company_len CHECK (CHAR_LENGTH(company_name) >= 2)
) ENGINE=InnoDB;
 
-- ------------------------------------------------------------
-- login_attempts: per-email throttle (MAX_ATTEMPTS = 5, LOCK_MS = 30 s)
-- NOTE: the JS prototype keeps ONE global counter, so one person's
-- failures lock everybody out. Keying by email fixes that.
-- ------------------------------------------------------------
CREATE TABLE login_attempts (
  email         VARCHAR(255)      NOT NULL,
  attempts      TINYINT UNSIGNED  NOT NULL DEFAULT 0,
  locked_until  DATETIME          NULL,
  updated_at    TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (email)
) ENGINE=InnoDB;
 
-- ------------------------------------------------------------
-- password_resets: 6-digit code, valid 10 minutes (US-04)
-- ------------------------------------------------------------
CREATE TABLE password_resets (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  code_hash   CHAR(64)        NOT NULL,                -- SHA-256 of the code, not the code itself
  expires_at  DATETIME        NOT NULL,
  used_at     DATETIME        NULL,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_resets_user_active (user_id, used_at, expires_at),
  CONSTRAINT fk_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
 
-- ------------------------------------------------------------
-- user_sessions: server-side sessions ("Remember me" = long expiry)
-- ------------------------------------------------------------
CREATE TABLE user_sessions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  token_hash  CHAR(64)        NOT NULL,                -- SHA-256 of the cookie token
  remember    BOOLEAN         NOT NULL DEFAULT FALSE,
  expires_at  DATETIME        NOT NULL,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
 
-- ============================================================
-- Seed data
-- ============================================================
INSERT INTO industries (name) VALUES
  ('Information Technology'), ('Finance & Banking'), ('Healthcare'),
  ('Education'), ('Engineering & Construction'), ('Retail & E-commerce'), ('Other');
 
-- Demo accounts. Replace the placeholders with real bcrypt hashes generated by your
-- backend (e.g. bcrypt.hashSync('Demo@1234', 12)). Demo passwords: Demo@1234 / Admin@1234.
INSERT INTO users (role, name, email, password_hash, status) VALUES
  ('seeker',   'Ayesha Khan',    'seeker@demo.com',          '<BCRYPT_HASH_FOR_Demo@1234>',  'active'),
  ('employer', 'Bilal Ahmed',    'employer@demo.com',        '<BCRYPT_HASH_FOR_Demo@1234>',  'active'),
  ('admin',    'Platform Admin', 'admin@careerbridge.com',   '<BCRYPT_HASH_FOR_Admin@1234>', 'active');
 
INSERT INTO employer_profiles (user_id, company_name, industry_id)
SELECT u.id, 'Nexa Technologies', i.id
FROM users u JOIN industries i ON i.name = 'Information Technology'
WHERE u.email = 'employer@demo.com';
 
-- ============================================================
-- Views
-- ============================================================
-- Admin approval queue (US-21)
CREATE OR REPLACE VIEW v_pending_employers AS
SELECT u.id, u.name AS owner_name, u.email, e.company_name, i.name AS industry, u.created_at
FROM users u
JOIN employer_profiles e ON e.user_id = u.id
JOIN industries i        ON i.id = e.industry_id
WHERE u.role = 'employer' AND u.status = 'pending'
ORDER BY u.created_at;
 
-- ============================================================
-- Stored procedures for the core flows
-- ============================================================
DELIMITER $$
 
-- US-01 / US-02: register a seeker or employer in one transaction.
-- Employers start as 'pending' when p_employer_needs_approval = 1 (Auth.EMPLOYER_NEEDS_APPROVAL).
CREATE PROCEDURE sp_register_user (
  IN  p_role          VARCHAR(10),
  IN  p_name          VARCHAR(100),
  IN  p_email         VARCHAR(255),
  IN  p_password_hash VARCHAR(255),
  IN  p_company       VARCHAR(150),
  IN  p_industry      VARCHAR(80),
  IN  p_employer_needs_approval BOOLEAN,
  OUT p_user_id       BIGINT UNSIGNED
)
BEGIN
  DECLARE v_status VARCHAR(10);
  DECLARE v_industry_id SMALLINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
 
  IF p_role NOT IN ('seeker','employer') THEN        -- admins can never self-register
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Choose a valid account type.';
  END IF;
 
  SET v_status = IF(p_role = 'employer' AND p_employer_needs_approval, 'pending', 'active');
 
  START TRANSACTION;
    INSERT INTO users (role, name, email, password_hash, status)
    VALUES (p_role, TRIM(p_name), LOWER(TRIM(p_email)), p_password_hash, v_status);  -- duplicate email => error 1062
    SET p_user_id = LAST_INSERT_ID();
 
    IF p_role = 'employer' THEN
      SELECT id INTO v_industry_id FROM industries WHERE name = p_industry;
      IF v_industry_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Select an industry.';
      END IF;
      INSERT INTO employer_profiles (user_id, company_name, industry_id)
      VALUES (p_user_id, TRIM(p_company), v_industry_id);
    END IF;
  COMMIT;
END$$
 
-- US-03: record a failed login; locks the email for 30 s after 5 failures.
CREATE PROCEDURE sp_record_failed_login (IN p_email VARCHAR(255))
BEGIN
  INSERT INTO login_attempts (email, attempts) VALUES (LOWER(TRIM(p_email)), 1)
  ON DUPLICATE KEY UPDATE
    attempts     = IF(attempts + 1 >= 5, 0, attempts + 1),
    locked_until = IF(attempts + 1 >= 5, NOW() + INTERVAL 30 SECOND, locked_until);
END$$
 
-- US-03: clear the counter after a successful login.
CREATE PROCEDURE sp_clear_login_attempts (IN p_email VARCHAR(255))
BEGIN
  DELETE FROM login_attempts WHERE email = LOWER(TRIM(p_email));
END$$
 
-- US-04: save a fresh reset code (10 min) and invalidate older unused ones.
CREATE PROCEDURE sp_create_password_reset (IN p_email VARCHAR(255), IN p_code_hash CHAR(64))
BEGIN
  DECLARE v_user_id BIGINT UNSIGNED;
  SELECT id INTO v_user_id FROM users WHERE email = LOWER(TRIM(p_email));
  IF v_user_id IS NOT NULL THEN
    UPDATE password_resets SET used_at = NOW() WHERE user_id = v_user_id AND used_at IS NULL;
    INSERT INTO password_resets (user_id, code_hash, expires_at)
    VALUES (v_user_id, p_code_hash, NOW() + INTERVAL 10 MINUTE);
  END IF;  -- silent when the email is unknown: no account enumeration
END$$
 
-- US-04: verify the code and set the new password atomically. Returns 1 on success, else 0.
CREATE PROCEDURE sp_reset_password (
  IN p_email VARCHAR(255), IN p_code_hash CHAR(64), IN p_new_password_hash VARCHAR(255)
)
BEGIN
  DECLARE v_reset_id BIGINT UNSIGNED;
  DECLARE v_user_id  BIGINT UNSIGNED;
 
  SELECT r.id, r.user_id INTO v_reset_id, v_user_id
  FROM password_resets r JOIN users u ON u.id = r.user_id
  WHERE u.email = LOWER(TRIM(p_email)) AND r.code_hash = p_code_hash
    AND r.used_at IS NULL AND r.expires_at > NOW()
  ORDER BY r.id DESC LIMIT 1;
 
  IF v_reset_id IS NULL THEN
    SELECT 0 AS success;
  ELSE
    START TRANSACTION;
      UPDATE users SET password_hash = p_new_password_hash WHERE id = v_user_id;
      UPDATE password_resets SET used_at = NOW() WHERE id = v_reset_id;
      DELETE FROM user_sessions WHERE user_id = v_user_id;   -- sign out everywhere
    COMMIT;
    SELECT 1 AS success;
  END IF;
END$$
 
-- US-21: admin approves / suspends / reactivates an account.
CREATE PROCEDURE sp_set_user_status (IN p_user_id BIGINT UNSIGNED, IN p_status VARCHAR(10))
BEGIN
  IF p_status NOT IN ('active','pending','suspended') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid status.';
  END IF;
  UPDATE users SET status = p_status WHERE id = p_user_id AND role <> 'admin';
  IF p_status = 'suspended' THEN
    DELETE FROM user_sessions WHERE user_id = p_user_id;     -- ends the session immediately
  END IF;
END$$
 
DELIMITER ;
 
-- ============================================================
-- Housekeeping (run via cron or a MySQL event)
-- ============================================================
SET GLOBAL event_scheduler = ON;
 
CREATE EVENT IF NOT EXISTS ev_purge_expired_auth_data
ON SCHEDULE EVERY 1 HOUR
DO
  DELETE FROM user_sessions WHERE expires_at < NOW();