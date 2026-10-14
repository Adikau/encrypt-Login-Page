import express, { type Response } from 'express';
import {
  findUserById,
  getAllUsersSummary,
  getAuditLogs,
  sanitizeUser,
} from '../db.ts';
import {
  authenticateToken,
  requireRole,
  type AuthenticatedRequest,
} from '../middleware/auth.ts';

export const secureRouter = express.Router();

// ---------------------------------------------------------------------------
// 1. GET /api/secure/dashboard (Protected: Any Authenticated User)
// ---------------------------------------------------------------------------
secureRouter.get(
  '/dashboard',
  authenticateToken,
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const userLogs = getAuditLogs(user.id);

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expSeconds = req.jwtPayload?.exp || nowSeconds;
    const secondsRemaining = Math.max(0, expSeconds - nowSeconds);

    res.status(200).json({
      status: 'authenticated',
      message: `Welcome to the secure dashboard, ${user.name}!`,
      user: sanitizeUser(user),
      session: {
        issuer: 'authguard-api',
        issuedAt: req.jwtPayload?.iat
          ? new Date(req.jwtPayload.iat * 1000).toISOString()
          : null,
        expiresAt: new Date(expSeconds * 1000).toISOString(),
        secondsRemaining,
        role: user.role,
      },
      securityOverview: {
        emailVerified: user.is_verified,
        passwordHashingAlgorithm: 'bcrypt (salt rounds = 12)',
        jwtAlgorithm: 'HS256',
        sessionStorage: 'HTTP-only SameSite cookie & Bearer Authorization Header',
        lastLogin: user.last_login_at,
        accountCreated: user.created_at,
      },
      auditHistory: userLogs.slice(0, 10),
    });
  }
);

// ---------------------------------------------------------------------------
// 2. GET /api/secure/admin-stats (Protected: Admin Only)
// ---------------------------------------------------------------------------
secureRouter.get(
  '/admin-stats',
  authenticateToken,
  requireRole('admin'),
  (req: AuthenticatedRequest, res: Response): void => {
    const allUsers = getAllUsersSummary();
    const allAuditLogs = getAuditLogs();

    const totalUsers = allUsers.length;
    const verifiedUsers = allUsers.filter((u) => u.is_verified).length;
    const unverifiedUsers = totalUsers - verifiedUsers;
    const failedLogins = allAuditLogs.filter(
      (l) => l.action.startsWith('LOGIN_FAILED') || l.status === 'FAILED'
    ).length;

    res.status(200).json({
      message: 'System Security Metrics & User Directory (Admin Access Granted)',
      adminUser: sanitizeUser(req.user!),
      metrics: {
        totalAccounts: totalUsers,
        verifiedAccounts: verifiedUsers,
        unverifiedAccounts: unverifiedUsers,
        verificationRate: totalUsers > 0 ? `${Math.round((verifiedUsers / totalUsers) * 100)}%` : '0%',
        failedLoginAttemptsCount: failedLogins,
        totalAuditLogsRecorded: allAuditLogs.length,
      },
      usersDirectory: allUsers,
      recentAuditLogs: allAuditLogs.slice(0, 25),
    });
  }
);
