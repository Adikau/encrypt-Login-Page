import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { findUserById, type UserRecord } from '../db.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'authguard-super-secret-jwt-key-change-in-production-2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';

const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'authguard-refresh-secret-jwt-key-change-in-production-2026';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export interface JwtPayload {
  id: string;
  email: string;
  role: 'user' | 'admin';
  name: string;
  iat?: number;
  exp?: number;
}

export interface RefreshJwtPayload {
  id: string;
  tokenType: 'refresh';
  iat?: number;
  exp?: number;
}

// Extend Express Request type
export interface AuthenticatedRequest extends Request {
  user?: UserRecord;
  jwtPayload?: JwtPayload;
}

export function generateAccessToken(user: UserRecord): string {
  const payload: JwtPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    issuer: 'authguard-api',
  });
}

export function generateRefreshToken(user: UserRecord): string {
  const payload: RefreshJwtPayload = {
    id: user.id,
    tokenType: 'refresh',
  };

  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    issuer: 'authguard-api',
  });
}

export function verifyRefreshToken(token: string): RefreshJwtPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: 'authguard-api',
    }) as RefreshJwtPayload;
  } catch {
    return null;
  }
}

// Authentication Middleware
export function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  }

  if (!token) {
    res.status(401).json({
      error: 'Access denied: Authentication token required',
      code: 'TOKEN_MISSING',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'authguard-api',
    }) as JwtPayload;

    const user = findUserById(decoded.id);
    if (!user) {
      res.status(401).json({
        error: 'User associated with token no longer exists',
        code: 'USER_NOT_FOUND',
      });
      return;
    }

    req.user = user;
    req.jwtPayload = decoded;
    next();
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Authentication token has expired',
        code: 'TOKEN_EXPIRED',
        expiredAt: err.expiredAt,
      });
      return;
    }

    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'Invalid authentication token signature',
        code: 'TOKEN_INVALID',
      });
      return;
    }

    res.status(500).json({
      error: 'Internal token authentication error',
      code: 'AUTH_INTERNAL_ERROR',
    });
  }
}

// Role Authorization Middleware
export function requireRole(allowedRole: 'admin' | 'user') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized: Authentication required',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    if (req.user.role !== allowedRole && req.user.role !== 'admin') {
      res.status(403).json({
        error: `Forbidden: Requires '${allowedRole}' privilege level`,
        code: 'FORBIDDEN_INSUFFICIENT_PERMISSIONS',
        userRole: req.user.role,
        requiredRole: allowedRole,
      });
      return;
    }

    next();
  };
}
