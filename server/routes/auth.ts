import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import {
  addAuditLog,
  createUser,
  findUserByEmail,
  findUserById,
  findUserByResetToken,
  findUserByVerificationToken,
  markUserVerified,
  resetUserPassword,
  sanitizeUser,
  setResetPasswordToken,
  setVerificationToken,
  updateLastLogin,
} from '../db.ts';
import { sendPasswordResetEmail, sendVerificationEmail } from '../mail.ts';
import {
  authenticateToken,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';

export const authRouter = express.Router();

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;

// Password complexity regex: min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_\-+=\[\]{}|:;,<.>~`])[A-Za-z\d@$!%*?&#^()_\-+=\[\]{}|:;,<.>~`]{8,100}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

function getAppBaseUrl(req: Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL;
  }
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const host = req.get('host') || 'localhost:3000';
  return `${protocol}://${host}`;
}

// ---------------------------------------------------------------------------
// 1. REGISTER
// ---------------------------------------------------------------------------
authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { name, email, password } = req.body || {};
  const ip = getClientIp(req);
  const userAgent = req.get('user-agent') || 'Unknown';

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    res.status(400).json({ error: 'Name must be at least 2 characters long' });
    return;
  }

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    res.status(400).json({ error: 'Please provide a valid email address' });
    return;
  }

  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'Password is required' });
    return;
  }

  if (!PASSWORD_REGEX.test(password)) {
    res.status(400).json({
      error:
        'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.',
      ruleHelp: {
        minLength: password.length >= 8,
        hasUppercase: /[A-Z]/.test(password),
        hasLowercase: /[a-z]/.test(password),
        hasNumber: /\d/.test(password),
        hasSpecialChar: /[@$!%*?&#^()_\-+=\[\]{}|:;,<.>~`]/.test(password),
      },
    });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = findUserByEmail(normalizedEmail);

  if (existingUser) {
    addAuditLog({
      userId: existingUser.id,
      email: normalizedEmail,
      action: 'REGISTER_FAILED_DUPLICATE',
      ipAddress: ip,
      userAgent,
      status: 'BLOCKED',
      details: 'Attempted registration with existing email',
    });
    res.status(409).json({ error: 'An account with this email address already exists' });
    return;
  }

  try {
    // Generate bcrypt salt & hash with work factor = 12
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Generate cryptographic verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const newUser = createUser({
      name,
      email: normalizedEmail,
      passwordHash,
      verificationToken,
      verificationTokenExpiresAt,
      role: 'user',
    });

    // Send verification email
    const appUrl = getAppBaseUrl(req);
    const emailMessage = sendVerificationEmail({
      toEmail: newUser.email,
      name: newUser.name,
      token: verificationToken,
      appUrl,
    });

    addAuditLog({
      userId: newUser.id,
      email: newUser.email,
      action: 'REGISTER_SUCCESS',
      ipAddress: ip,
      userAgent,
      status: 'SUCCESS',
      details: `Account registered. Verification email dispatched (Token exp: 24h).`,
    });

    res.status(201).json({
      message: 'Account created successfully! Please check your email to verify your account.',
      user: sanitizeUser(newUser),
      verificationDetails: {
        token: verificationToken,
        expiresAt: verificationTokenExpiresAt,
        actionUrl: emailMessage.actionUrl,
      },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed due to an internal server error' });
  }
});

// ---------------------------------------------------------------------------
// 2. VERIFY EMAIL
// ---------------------------------------------------------------------------
authRouter.post('/verify-email', (req: Request, res: Response): void => {
  const { token } = req.body || {};
  const ip = getClientIp(req);
  const userAgent = req.get('user-agent') || 'Unknown';

  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Verification token is required' });
    return;
  }

  const user = findUserByVerificationToken(token.trim());

  if (!user) {
    res.status(400).json({
      error: 'Invalid or already utilized verification token. Please check your link or request a new one.',
      code: 'INVALID_TOKEN',
    });
    return;
  }

  // Check expiration
  if (user.verification_token_expires_at) {
    const expiresAt = new Date(user.verification_token_expires_at).getTime();
    if (Date.now() > expiresAt) {
      addAuditLog({
        userId: user.id,
        email: user.email,
        action: 'VERIFY_EMAIL_EXPIRED',
        ipAddress: ip,
        userAgent,
        status: 'FAILED',
        details: 'Attempted verification with expired token',
      });
      res.status(400).json({
        error: 'Verification token has expired. Please request a new verification email.',
        code: 'TOKEN_EXPIRED',
        email: user.email,
      });
      return;
    }
  }

  markUserVerified(user.id);

  addAuditLog({
    userId: user.id,
    email: user.email,
    action: 'VERIFY_EMAIL_SUCCESS',
    ipAddress: ip,
    userAgent,
    status: 'SUCCESS',
    details: 'User email verified successfully',
  });

  res.status(200).json({
    message: 'Email address verified successfully! You can now log into your account.',
    user: sanitizeUser(user),
  });
});

// ---------------------------------------------------------------------------
// 3. RESEND VERIFICATION
// ---------------------------------------------------------------------------
authRouter.post('/resend-verification', (req: Request, res: Response): void => {
  const { email } = req.body || {};
  const ip = getClientIp(req);
  const userAgent = req.get('user-agent') || 'Unknown';

  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'Email is required' });
    return;
  }

  const user = findUserByEmail(email);
  if (!user) {
    // Return standard message to prevent email enumeration
    res.status(200).json({
      message: 'If an account exists with this email address, a new verification link has been sent.',
    });
    return;
  }

  if (user.is_verified) {
    res.status(400).json({
      error: 'This account is already verified. You can log in directly.',
      isVerified: true,
    });
    return;
  }

  const verificationToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  setVerificationToken(user.id, verificationToken, expiresAt);

  const appUrl = getAppBaseUrl(req);
  const emailMsg = sendVerificationEmail({
    toEmail: user.email,
    name: user.name,
    token: verificationToken,
    appUrl,
  });

  addAuditLog({
    userId: user.id,
    email: user.email,
    action: 'RESEND_VERIFICATION',
    ipAddress: ip,
    userAgent,
    status: 'SUCCESS',
    details: 'Verification link resent to user email',
  });

  res.status(200).json({
    message: 'A fresh verification link has been dispatched to your email.',
    verificationDetails: {
      token: verificationToken,
      expiresAt,
      actionUrl: emailMsg.actionUrl,
    },
  });
});

// ---------------------------------------------------------------------------
// 4. LOGIN
// ---------------------------------------------------------------------------
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body || {};
  const ip = getClientIp(req);
  const userAgent = req.get('user-agent') || 'Unknown';

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = findUserByEmail(email);

  if (!user) {
    addAuditLog({
      userId: null,
      email: email.trim().toLowerCase(),
      action: 'LOGIN_FAILED',
      ipAddress: ip,
      userAgent,
      status: 'FAILED',
      details: 'Account not found',
    });
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  // Bcrypt password comparison
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    addAuditLog({
      userId: user.id,
      email: user.email,
      action: 'LOGIN_FAILED_BAD_PASSWORD',
      ipAddress: ip,
      userAgent,
      status: 'FAILED',
      details: 'Password verification failed',
    });
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  // Check verification status
  if (!user.is_verified) {
    addAuditLog({
      userId: user.id,
      email: user.email,
      action: 'LOGIN_BLOCKED_UNVERIFIED',
      ipAddress: ip,
      userAgent,
      status: 'BLOCKED',
      details: 'Attempted login with unverified email',
    });
    res.status(403).json({
      error: 'Please verify your email address before logging in.',
      code: 'ACCOUNT_NOT_VERIFIED',
      unverified: true,
      email: user.email,
    });
    return;
  }

  // Generate JWT access token & refresh token
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  updateLastLogin(user.id);

  addAuditLog({
    userId: user.id,
    email: user.email,
    action: 'LOGIN_SUCCESS',
    ipAddress: ip,
    userAgent,
    status: 'SUCCESS',
    details: `Authenticated as ${user.role}. JWT tokens issued.`,
  });

  // Set HTTP-Only cookies
  res.cookie('auth_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000, // 15 mins
  });

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.status(200).json({
    message: 'Authentication successful',
    token: accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: '15m',
    user: sanitizeUser(user),
  });
});

// ---------------------------------------------------------------------------
// 5. REFRESH TOKEN
// ---------------------------------------------------------------------------
authRouter.post('/refresh', (req: Request, res: Response): void => {
  let refreshToken = req.body?.refreshToken;
  if (!refreshToken && req.cookies && req.cookies.refresh_token) {
    refreshToken = req.cookies.refresh_token;
  }

  if (!refreshToken) {
    res.status(401).json({ error: 'Refresh token required', code: 'REFRESH_TOKEN_MISSING' });
    return;
  }

  const payload = verifyRefreshToken(refreshToken);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired refresh token', code: 'REFRESH_TOKEN_INVALID' });
    return;
  }

  const user = findUserById(payload.id);
  if (!user) {
    res.status(401).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    return;
  }

  const newAccessToken = generateAccessToken(user);

  res.cookie('auth_token', newAccessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
  });

  res.status(200).json({
    token: newAccessToken,
    tokenType: 'Bearer',
    expiresIn: '15m',
  });
});

// ---------------------------------------------------------------------------
// 6. FORGOT PASSWORD
// ---------------------------------------------------------------------------
authRouter.post('/forgot-password', (req: Request, res: Response): void => {
  const { email } = req.body || {};
  const ip = getClientIp(req);
  const userAgent = req.get('user-agent') || 'Unknown';

  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'Email is required' });
    return;
  }

  const user = findUserByEmail(email);
  if (!user) {
    // Generic response to prevent user enumeration
    res.status(200).json({
      message: 'If your email is registered in our database, a password reset link has been dispatched.',
    });
    return;
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  setResetPasswordToken(user.id, resetToken, expiresAt);

  const appUrl = getAppBaseUrl(req);
  const emailMsg = sendPasswordResetEmail({
    toEmail: user.email,
    name: user.name,
    token: resetToken,
    appUrl,
  });

  addAuditLog({
    userId: user.id,
    email: user.email,
    action: 'FORGOT_PASSWORD_REQUEST',
    ipAddress: ip,
    userAgent,
    status: 'SUCCESS',
    details: 'Password reset token generated and sent (Exp: 1h)',
  });

  res.status(200).json({
    message: 'If your email is registered in our database, a password reset link has been dispatched.',
    resetDetails: {
      token: resetToken,
      expiresAt,
      actionUrl: emailMsg.actionUrl,
    },
  });
});

// ---------------------------------------------------------------------------
// 7. RESET PASSWORD
// ---------------------------------------------------------------------------
authRouter.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const { token, newPassword } = req.body || {};
  const ip = getClientIp(req);
  const userAgent = req.get('user-agent') || 'Unknown';

  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Reset token is required' });
    return;
  }

  if (!newPassword || typeof newPassword !== 'string') {
    res.status(400).json({ error: 'New password is required' });
    return;
  }

  if (!PASSWORD_REGEX.test(newPassword)) {
    res.status(400).json({
      error:
        'New password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.',
      ruleHelp: {
        minLength: newPassword.length >= 8,
        hasUppercase: /[A-Z]/.test(newPassword),
        hasLowercase: /[a-z]/.test(newPassword),
        hasNumber: /\d/.test(newPassword),
        hasSpecialChar: /[@$!%*?&#^()_\-+=\[\]{}|:;,<.>~`]/.test(newPassword),
      },
    });
    return;
  }

  const user = findUserByResetToken(token.trim());

  if (!user) {
    res.status(400).json({
      error: 'Invalid or expired password reset token. Please request a new link.',
      code: 'INVALID_RESET_TOKEN',
    });
    return;
  }

  // Check expiration
  if (user.reset_password_expires_at) {
    const expiresAt = new Date(user.reset_password_expires_at).getTime();
    if (Date.now() > expiresAt) {
      addAuditLog({
        userId: user.id,
        email: user.email,
        action: 'RESET_PASSWORD_EXPIRED',
        ipAddress: ip,
        userAgent,
        status: 'FAILED',
        details: 'Attempted password reset with expired token',
      });
      res.status(400).json({
        error: 'Password reset token has expired. Please initiate a new password reset request.',
        code: 'TOKEN_EXPIRED',
      });
      return;
    }
  }

  try {
    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    resetUserPassword(user.id, newPasswordHash);

    addAuditLog({
      userId: user.id,
      email: user.email,
      action: 'RESET_PASSWORD_SUCCESS',
      ipAddress: ip,
      userAgent,
      status: 'SUCCESS',
      details: 'User password reset completed and salt-rehashed (Cost: 12)',
    });

    res.status(200).json({
      message: 'Password has been successfully updated! You can now log in with your new credentials.',
    });
  } catch (err) {
    console.error('Password reset hashing error:', err);
    res.status(500).json({ error: 'Password reset failed due to internal error' });
  }
});

// ---------------------------------------------------------------------------
// 8. LOGOUT
// ---------------------------------------------------------------------------
authRouter.post('/logout', (req: Request, res: Response): void => {
  res.clearCookie('auth_token');
  res.clearCookie('refresh_token');

  res.status(200).json({ message: 'Logged out successfully' });
});

// ---------------------------------------------------------------------------
// 9. GET /me (Protected)
// ---------------------------------------------------------------------------
authRouter.get('/me', authenticateToken, (req: AuthenticatedRequest, res: Response): void => {
  if (!req.user) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  res.status(200).json({
    user: sanitizeUser(req.user),
    session: {
      issuedAt: req.jwtPayload?.iat ? new Date(req.jwtPayload.iat * 1000).toISOString() : null,
      expiresAt: req.jwtPayload?.exp ? new Date(req.jwtPayload.exp * 1000).toISOString() : null,
    },
  });
});
