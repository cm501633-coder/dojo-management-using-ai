CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS members (
  id CHAR(36) PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(30) NULL,
  belt_rank VARCHAR(40) NOT NULL DEFAULT 'White belt',
  joined_on DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_members_active_name (active, full_name)
);

CREATE TABLE IF NOT EXISTS attendance (
  id CHAR(36) PRIMARY KEY,
  member_id CHAR(36) NOT NULL,
  attendance_date DATE NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance_member_date (member_id, attendance_date),
  INDEX idx_attendance_date (attendance_date),
  CONSTRAINT fk_attendance_member
    FOREIGN KEY (member_id) REFERENCES members(id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS fees (
  id CHAR(36) PRIMARY KEY,
  member_id CHAR(36) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  fee_period VARCHAR(20) NOT NULL,
  paid_on DATE NOT NULL,
  payment_method ENUM('cash', 'card', 'bank transfer', 'other') NOT NULL DEFAULT 'cash',
  note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fees_paid_on (paid_on),
  INDEX idx_fees_member_period (member_id, fee_period),
  CONSTRAINT fk_fees_member
    FOREIGN KEY (member_id) REFERENCES members(id)
    ON DELETE RESTRICT,
  CONSTRAINT chk_fee_amount_positive CHECK (amount > 0)
);
