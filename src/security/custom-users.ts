import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { encrypt, decrypt } from "@/security/crypto";

export interface CustomUser {
  id: string;
  email: string;
  profile: string;
  mfaEnrolled: boolean;
  mfaSecret: string | null;
  mfaBackupCodeHashes: string[];
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomUserStore {
  pool: Pool;
  encryptionKey: string;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS custom_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  profile TEXT NOT NULL,
  mfa_enrolled BOOLEAN NOT NULL DEFAULT false,
  mfa_secret_encrypted BYTEA,
  mfa_nonce BYTEA,
  mfa_backup_codes_hashes TEXT[] NOT NULL DEFAULT '{}',
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS custom_users_email_lower_idx ON custom_users (LOWER(email));
`;

let schemaInitialized = false;

export function createStore(databaseUrl: string, encryptionKey: string): CustomUserStore {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  return { pool, encryptionKey };
}

export async function ensureSchema(store: CustomUserStore): Promise<void> {
  if (schemaInitialized) return;
  await store.pool.query(SCHEMA_SQL);
  schemaInitialized = true;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

interface DbRow {
  id: string;
  email: string;
  password_hash: string;
  profile: string;
  mfa_enrolled: boolean;
  mfa_secret_encrypted: Buffer | null;
  mfa_nonce: Buffer | null;
  mfa_backup_codes_hashes: string[];
  failed_login_attempts: number;
  locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

function rowToUser(row: DbRow, encryptionKey: string): CustomUser {
  let mfaSecret: string | null = null;
  if (row.mfa_enrolled && row.mfa_secret_encrypted && row.mfa_nonce) {
    mfaSecret = decrypt(row.mfa_secret_encrypted, row.mfa_nonce, encryptionKey);
  }
  return {
    id: row.id,
    email: row.email,
    profile: row.profile,
    mfaEnrolled: row.mfa_enrolled,
    mfaSecret,
    mfaBackupCodeHashes: row.mfa_backup_codes_hashes || [],
    passwordHash: row.password_hash,
    failedLoginAttempts: row.failed_login_attempts,
    lockedUntil: row.locked_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getUserByEmail(store: CustomUserStore, email: string): Promise<CustomUser | null> {
  await ensureSchema(store);
  const res = await store.pool.query<DbRow>(
    `SELECT id, email, password_hash, profile, mfa_enrolled, mfa_secret_encrypted, mfa_nonce,
            mfa_backup_codes_hashes, failed_login_attempts, locked_until, created_at, updated_at
     FROM custom_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email],
  );
  if (res.rowCount === 0) return null;
  return rowToUser(res.rows[0], store.encryptionKey);
}

export interface UserSummary {
  id: string;
  email: string;
  profile: string;
  mfaEnrolled: boolean;
  lockedUntil: Date | null;
  createdAt: Date;
}

export async function listUsers(store: CustomUserStore): Promise<UserSummary[]> {
  await ensureSchema(store);
  const res = await store.pool.query<DbRow>(
    `SELECT id, email, password_hash, profile, mfa_enrolled, mfa_secret_encrypted, mfa_nonce,
            mfa_backup_codes_hashes, failed_login_attempts, locked_until, created_at, updated_at
     FROM custom_users ORDER BY created_at ASC`,
  );
  return res.rows.map((r) => ({
    id: r.id,
    email: r.email,
    profile: r.profile,
    mfaEnrolled: r.mfa_enrolled,
    lockedUntil: r.locked_until,
    createdAt: r.created_at,
  }));
}

export interface CreateUserInput {
  email: string;
  tempPassword: string;
  profile: string;
}

export async function createUser(store: CustomUserStore, input: CreateUserInput): Promise<UserSummary> {
  await ensureSchema(store);
  const passwordHash = await hashPassword(input.tempPassword);
  const res = await store.pool.query<DbRow>(
    `INSERT INTO custom_users (email, password_hash, profile)
     VALUES (LOWER($1), $2, $3)
     RETURNING id, email, password_hash, profile, mfa_enrolled, mfa_secret_encrypted, mfa_nonce,
               mfa_backup_codes_hashes, failed_login_attempts, locked_until, created_at, updated_at`,
    [input.email, passwordHash, input.profile],
  );
  const r = res.rows[0];
  return {
    id: r.id,
    email: r.email,
    profile: r.profile,
    mfaEnrolled: r.mfa_enrolled,
    lockedUntil: r.locked_until,
    createdAt: r.created_at,
  };
}

export async function deleteUser(store: CustomUserStore, email: string): Promise<boolean> {
  await ensureSchema(store);
  const res = await store.pool.query(
    `DELETE FROM custom_users WHERE LOWER(email) = LOWER($1)`,
    [email],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function resetMfa(store: CustomUserStore, email: string): Promise<boolean> {
  await ensureSchema(store);
  const res = await store.pool.query(
    `UPDATE custom_users
     SET mfa_enrolled = false, mfa_secret_encrypted = NULL, mfa_nonce = NULL,
         mfa_backup_codes_hashes = '{}', updated_at = NOW()
     WHERE LOWER(email) = LOWER($1)`,
    [email],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function completeMfaEnrollment(
  store: CustomUserStore,
  email: string,
  secret: string,
  backupCodeHashes: string[],
): Promise<void> {
  await ensureSchema(store);
  const enc = encrypt(secret, store.encryptionKey);
  await store.pool.query(
    `UPDATE custom_users
     SET mfa_enrolled = true, mfa_secret_encrypted = $2, mfa_nonce = $3,
         mfa_backup_codes_hashes = $4, failed_login_attempts = 0, locked_until = NULL,
         updated_at = NOW()
     WHERE LOWER(email) = LOWER($1)`,
    [email, enc.ciphertext, enc.nonce, backupCodeHashes],
  );
}

export async function recordFailedLogin(store: CustomUserStore, email: string): Promise<{ attempts: number; locked: boolean }> {
  await ensureSchema(store);
  const res = await store.pool.query<{ failed_login_attempts: number; locked_until: Date | null }>(
    `UPDATE custom_users
     SET failed_login_attempts = failed_login_attempts + 1,
         locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END,
         updated_at = NOW()
     WHERE LOWER(email) = LOWER($1)
     RETURNING failed_login_attempts, locked_until`,
    [email],
  );
  if (res.rowCount === 0) return { attempts: 0, locked: false };
  const row = res.rows[0];
  return { attempts: row.failed_login_attempts, locked: row.locked_until !== null && row.locked_until > new Date() };
}

export async function resetFailedLogins(store: CustomUserStore, email: string): Promise<void> {
  await ensureSchema(store);
  await store.pool.query(
    `UPDATE custom_users
     SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
     WHERE LOWER(email) = LOWER($1)`,
    [email],
  );
}

export async function updateBackupCodes(store: CustomUserStore, email: string, hashes: string[]): Promise<void> {
  await ensureSchema(store);
  await store.pool.query(
    `UPDATE custom_users SET mfa_backup_codes_hashes = $2, updated_at = NOW()
     WHERE LOWER(email) = LOWER($1)`,
    [email, hashes],
  );
}
