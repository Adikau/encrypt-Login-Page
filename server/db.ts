import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'user' | 'admin';
  is_verified: boolean;
  verification_token: string | null;
  verification_token_expires_at: string | null;
  reset_password_token: string | null;
  reset_password_expires_at: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface AuditLogRecord {
  id: string;
  user_id: string | null;
  email: string;
  action: string;
  ip_address: string | null;
  user_agent: string | null;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  details: string | null;
  created_at: string;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

interface DatabaseStore {
  users: UserRecord[];
  audit_logs: AuditLogRecord[];
}

// In-memory cache + file sync
let db: DatabaseStore = {
  users: [],
  audit_logs: [],
};

// Ensure data directory exists
function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('Error creating data directory:', err);
  }
}

// Persist to disk atomically
function saveDb(): void {
  try {
    ensureDataDir();
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('Failed to write database file to disk:', err);
  }
}

// Load from disk or initialize with seeds
export function initDatabase(): void {
  ensureDataDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      db = JSON.parse(raw);
      if (!Array.isArray(db.users)) db.users = [];
      if (!Array.isArray(db.audit_logs)) db.audit_logs = [];
      return;
    } catch (err) {
      console.warn('Could not read existing database file, reseeding...', err);
    }
  }

  // Seed default demonstration users with bcrypt salt rounds = 12
  seedDefaultUsers();
}

export function seedDefaultUsers(): void {
  const salt = bcrypt.genSaltSync(12);
  const now = new Date().toISOString();

  // 1. Verified regular user: alice@example.com / Password123!
  const aliceHash = bcrypt.hashSync('Password123!', salt);
  // 2. Unverified user: bob@example.com / Password123!
  const bobHash = bcrypt.hashSync('Password123!', salt);
  // 3. Admin user: admin@example.com / AdminSecure2026!
  const adminHash = bcrypt.hashSync('AdminSecure2026!', salt);

  const bobVerificationToken = crypto.randomBytes(32).toString('hex');
  const bobTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.users = [
    {
      id: 'usr_alice_verified',
      name: 'Alice Johnson',
      email: 'alice@example.com',
      password_hash: aliceHash,
      role: 'user',
      is_verified: true,
      verification_token: null,
      verification_token_expires_at: null,
      reset_password_token: null,
      reset_password_expires_at: null,
      created_at: now,
      updated_at: now,
      last_login_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'usr_bob_unverified',
      name: 'Bob Smith',
      email: 'bob@example.com',
      password_hash: bobHash,
      role: 'user',
      is_verified: false,
      verification_token: bobVerificationToken,
      verification_token_expires_at: bobTokenExpiry,
      reset_password_token: null,
      reset_password_expires_at: null,
      created_at: now,
      updated_at: now,
      last_login_at: null,
    },
    {
      id: 'usr_admin_master',
      name: 'Security Admin',
      email: 'admin@example.com',
      password_hash: adminHash,
      role: 'admin',
      is_verified: true,
      verification_token: null,
      verification_token_expires_at: null,
      reset_password_token: null,
      reset_password_expires_at: null,
      created_at: now,
      updated_at: now,
      last_login_at: now,
    },
  ];

  db.audit_logs = [
    {
      id: 'log_' + crypto.randomBytes(8).toString('hex'),
      user_id: 'usr_alice_verified',
      email: 'alice@example.com',
      action: 'SYSTEM_SEED',
      ip_address: '127.0.0.1',
      user_agent: 'AuthGuard-Init/1.0',
      status: 'SUCCESS',
      details: 'Demo account seeded (Verified User)',
      created_at: now,
    },
    {
      id: 'log_' + crypto.randomBytes(8).toString('hex'),
      user_id: 'usr_bob_unverified',
      email: 'bob@example.com',
      action: 'SYSTEM_SEED',
      ip_address: '127.0.0.1',
      user_agent: 'AuthGuard-Init/1.0',
      status: 'SUCCESS',
      details: 'Demo account seeded (Unverified User with pending token)',
      created_at: now,
    },
    {
      id: 'log_' + crypto.randomBytes(8).toString('hex'),
      user_id: 'usr_admin_master',
      email: 'admin@example.com',
      action: 'SYSTEM_SEED',
      ip_address: '127.0.0.1',
      user_agent: 'AuthGuard-Init/1.0',
      status: 'SUCCESS',
      details: 'Demo account seeded (System Administrator)',
      created_at: now,
    },
  ];

  saveDb();
}

// Database helper functions
export function findUserByEmail(email: string): UserRecord | undefined {
  const normalized = email.trim().toLowerCase();
  return db.users.find((u) => u.email.toLowerCase() === normalized);
}

export function findUserById(id: string): UserRecord | undefined {
  return db.users.find((u) => u.id === id);
}

export function findUserByVerificationToken(token: string): UserRecord | undefined {
  if (!token) return undefined;
  return db.users.find((u) => u.verification_token === token);
}

export function findUserByResetToken(token: string): UserRecord | undefined {
  if (!token) return undefined;
  return db.users.find((u) => u.reset_password_token === token);
}

export function createUser(data: {
  name: string;
  email: string;
  passwordHash: string;
  verificationToken: string;
  verificationTokenExpiresAt: string;
  role?: 'user' | 'admin';
}): UserRecord {
  const now = new Date().toISOString();
  const newUser: UserRecord = {
    id: 'usr_' + crypto.randomUUID(),
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
    password_hash: data.passwordHash,
    role: data.role || 'user',
    is_verified: false,
    verification_token: data.verificationToken,
    verification_token_expires_at: data.verificationTokenExpiresAt,
    reset_password_token: null,
    reset_password_expires_at: null,
    created_at: now,
    updated_at: now,
    last_login_at: null,
  };

  db.users.push(newUser);
  saveDb();
  return newUser;
}

export function markUserVerified(userId: string): boolean {
  const user = findUserById(userId);
  if (!user) return false;

  user.is_verified = true;
  user.verification_token = null;
  user.verification_token_expires_at = null;
  user.updated_at = new Date().toISOString();
  saveDb();
  return true;
}

export function setVerificationToken(
  userId: string,
  token: string,
  expiresAt: string
): boolean {
  const user = findUserById(userId);
  if (!user) return false;

  user.verification_token = token;
  user.verification_token_expires_at = expiresAt;
  user.updated_at = new Date().toISOString();
  saveDb();
  return true;
}

export function setResetPasswordToken(
  userId: string,
  token: string,
  expiresAt: string
): boolean {
  const user = findUserById(userId);
  if (!user) return false;

  user.reset_password_token = token;
  user.reset_password_expires_at = expiresAt;
  user.updated_at = new Date().toISOString();
  saveDb();
  return true;
}

export function resetUserPassword(userId: string, newPasswordHash: string): boolean {
  const user = findUserById(userId);
  if (!user) return false;

  user.password_hash = newPasswordHash;
  user.reset_password_token = null;
  user.reset_password_expires_at = null;
  user.updated_at = new Date().toISOString();
  saveDb();
  return true;
}

export function updateLastLogin(userId: string): void {
  const user = findUserById(userId);
  if (user) {
    user.last_login_at = new Date().toISOString();
    saveDb();
  }
}

export function addAuditLog(log: {
  userId: string | null;
  email: string;
  action: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  details?: string | null;
}): AuditLogRecord {
  const record: AuditLogRecord = {
    id: 'log_' + crypto.randomBytes(8).toString('hex'),
    user_id: log.userId,
    email: log.email.toLowerCase(),
    action: log.action,
    ip_address: log.ipAddress || '127.0.0.1',
    user_agent: log.userAgent || 'Unknown',
    status: log.status,
    details: log.details || null,
    created_at: new Date().toISOString(),
  };

  db.audit_logs.unshift(record);
  // Keep last 150 audit entries in memory/disk
  if (db.audit_logs.length > 150) {
    db.audit_logs = db.audit_logs.slice(0, 150);
  }
  saveDb();
  return record;
}

export function getAuditLogs(userId?: string): AuditLogRecord[] {
  if (userId) {
    return db.audit_logs.filter((l) => l.user_id === userId);
  }
  return db.audit_logs;
}

export function getAllUsersSummary() {
  return db.users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    is_verified: u.is_verified,
    has_verification_token: Boolean(u.verification_token),
    has_reset_token: Boolean(u.reset_password_token),
    created_at: u.created_at,
    last_login_at: u.last_login_at,
  }));
}

// Strip sensitive fields for safe client transfer
export function sanitizeUser(user: UserRecord) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    is_verified: user.is_verified,
    created_at: user.created_at,
    last_login_at: user.last_login_at,
  };
}

// Initialize on module load
initDatabase();
