import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../server.ts';
import { seedDefaultUsers, findUserByEmail, findUserByResetToken } from '../server/db.ts';

describe('AuthGuard Authentication & Secure API Test Suite', () => {
  beforeEach(() => {
    // Reset seed database state before each test
    seedDefaultUsers();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user with bcrypt-hashed password and verification token', async () => {
      const uniqueEmail = `testuser_${Date.now()}@example.com`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Doe',
          email: uniqueEmail,
          password: 'SecurePassword123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(uniqueEmail);
      expect(res.body.user.is_verified).toBe(false);
      expect(res.body.verificationDetails).toBeDefined();
      expect(res.body.verificationDetails.token).toBeDefined();

      // Verify in DB that password was hashed with bcrypt (never plaintext)
      const userInDb = findUserByEmail(uniqueEmail);
      expect(userInDb).toBeDefined();
      expect(userInDb?.password_hash).not.toBe('SecurePassword123!');
      expect(userInDb?.password_hash.startsWith('$2')).toBe(true); // bcrypt prefix
      expect(userInDb?.verification_token).toBe(res.body.verificationDetails.token);
    });

    it('should reject registration if email is duplicate (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Alice Duplicate',
          email: 'alice@example.com', // Already seeded
          password: 'Password123!',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already exists/i);
    });

    it('should reject registration if password does not meet complexity rules', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Weak User',
          email: 'weak@example.com',
          password: 'simple', // Missing length, uppercase, numbers, special characters
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/password must be at least 8 characters/i);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should fail with 401 when given invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'alice@example.com',
          password: 'WrongPassword999!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('should fail with 401 when given non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('should fail with 403 if account email has not been verified', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'bob@example.com', // Seeded as unverified
          password: 'Password123!',
        });

      expect(res.status).toBe(403);
      expect(res.body.unverified).toBe(true);
      expect(res.body.error).toMatch(/verify your email/i);
    });

    it('should succeed with 200 and return JWT token for verified user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'alice@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.tokenType).toBe('Bearer');
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('alice@example.com');
      expect(res.body.user.is_verified).toBe(true);
    });
  });

  describe('POST /api/auth/verify-email', () => {
    it('should verify unverified user when valid token is supplied', async () => {
      const bob = findUserByEmail('bob@example.com');
      expect(bob).toBeDefined();
      expect(bob?.verification_token).toBeDefined();

      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: bob!.verification_token });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/verified successfully/i);

      // Verify database updated
      const updatedBob = findUserByEmail('bob@example.com');
      expect(updatedBob?.is_verified).toBe(true);
      expect(updatedBob?.verification_token).toBeNull();

      // Now Bob should be able to log in!
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'bob@example.com',
          password: 'Password123!',
        });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.token).toBeDefined();
    });

    it('should reject invalid verification token with 400', async () => {
      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: 'fake-invalid-token-123456789' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });
  });

  describe('Password Reset Flow', () => {
    it('should generate reset token and allow password reset with new password', async () => {
      // 1. Request password reset
      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'alice@example.com' });

      expect(forgotRes.status).toBe(200);
      expect(forgotRes.body.resetDetails).toBeDefined();
      const resetToken = forgotRes.body.resetDetails.token;
      expect(resetToken).toBeDefined();

      // 2. Perform password reset with valid token and strong new password
      const newPassword = 'BrandNewPassword2026!';
      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword,
        });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.message).toMatch(/successfully updated/i);

      // 3. Verify old password no longer works
      const oldLogin = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'alice@example.com',
          password: 'Password123!',
        });
      expect(oldLogin.status).toBe(401);

      // 4. Verify new password logs in successfully
      const newLogin = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'alice@example.com',
          password: newPassword,
        });
      expect(newLogin.status).toBe(200);
      expect(newLogin.body.token).toBeDefined();
    });

    it('should reject password reset with invalid token', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: 'invalid-nonexistent-token',
          newPassword: 'ValidNewPassword123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_RESET_TOKEN');
    });
  });

  describe('Secure Endpoints & Authorization', () => {
    let userToken: string;
    let adminToken: string;

    beforeEach(async () => {
      // Login as regular verified user Alice
      const userLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@example.com', password: 'Password123!' });
      userToken = userLogin.body.token;

      // Login as admin
      const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'AdminSecure2026!' });
      adminToken = adminLogin.body.token;
    });

    it('should block /api/auth/me without token (401)', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('TOKEN_MISSING');
    });

    it('should block /api/auth/me with invalid or tampered token (401)', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.tampered.token');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('TOKEN_INVALID');
    });

    it('should allow access to /api/auth/me with valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('alice@example.com');
    });

    it('should allow regular user to access /api/secure/dashboard', async () => {
      const res = await request(app)
        .get('/api/secure/dashboard')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('authenticated');
      expect(res.body.user.email).toBe('alice@example.com');
      expect(res.body.session).toBeDefined();
    });

    it('should forbid regular user from accessing /api/secure/admin-stats (403)', async () => {
      const res = await request(app)
        .get('/api/secure/admin-stats')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_INSUFFICIENT_PERMISSIONS');
    });

    it('should allow admin user to access /api/secure/admin-stats (200)', async () => {
      const res = await request(app)
        .get('/api/secure/admin-stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.metrics).toBeDefined();
      expect(res.body.metrics.totalAccounts).toBeGreaterThan(0);
      expect(res.body.usersDirectory).toBeDefined();
    });
  });
});
