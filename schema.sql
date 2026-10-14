-- ============================================================================
-- AuthGuard Database Schema
-- Compatible with PostgreSQL, MySQL, and SQLite (Standard ANSI SQL)
-- Features: User Accounts, Email Verification, Password Reset Tokens, Audit Logs
-- ============================================================================

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,                         -- UUID v4
    name VARCHAR(100) NOT NULL,                         -- User's full name
    email VARCHAR(255) NOT NULL UNIQUE,                 -- Normalized lower-cased unique email
    password_hash VARCHAR(255) NOT NULL,                -- bcrypt hash (salt rounds: 12)
    role VARCHAR(20) NOT NULL DEFAULT 'user',           -- 'user' | 'admin'
    
    -- Verification Fields
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,         -- Account verification flag
    verification_token VARCHAR(128) NULL,               -- Cryptographically secure hex token
    verification_token_expires_at TIMESTAMP NULL,       -- Verification token expiration timestamp
    
    -- Password Reset Fields
    reset_password_token VARCHAR(128) NULL,             -- Cryptographically secure reset token
    reset_password_expires_at TIMESTAMP NULL,           -- Reset token expiration timestamp
    
    -- Timestamp & Metadata
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL
);

-- Indexing for fast query lookups and token lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
CREATE INDEX IF NOT EXISTS idx_users_reset_password_token ON users(reset_password_token);

-- Refresh Tokens Table (For stateful JWT refresh token rotation and revocation)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMP NULL,
    CONSTRAINT fk_user_refresh FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Security Audit Logs Table (Tracks authentication events, failures, and security changes)
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NULL,
    email VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,                        -- 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'REGISTER', 'VERIFY_EMAIL', 'PASSWORD_RESET_REQ', 'PASSWORD_RESET_SUCCESS'
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    status VARCHAR(20) NOT NULL,                        -- 'SUCCESS' | 'FAILED' | 'BLOCKED'
    details TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
