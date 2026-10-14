import crypto from 'node:crypto';

export interface EmailMessage {
  id: string;
  to: string;
  from: string;
  subject: string;
  previewText: string;
  htmlContent: string;
  textContent: string;
  type: 'VERIFICATION' | 'PASSWORD_RESET' | 'SECURITY_ALERT';
  actionUrl: string;
  token: string;
  sentAt: string;
}

// In-memory outbox queue for dev inspection and testing
const outbox: EmailMessage[] = [];

export function getOutbox(): EmailMessage[] {
  return [...outbox];
}

export function clearOutbox(): void {
  outbox.length = 0;
}

export function sendVerificationEmail(params: {
  toEmail: string;
  name: string;
  token: string;
  appUrl: string;
}): EmailMessage {
  const actionUrl = `${params.appUrl}?action=verify&token=${encodeURIComponent(params.token)}`;
  const message: EmailMessage = {
    id: 'mail_' + crypto.randomBytes(8).toString('hex'),
    to: params.toEmail,
    from: process.env.EMAIL_FROM || 'AuthGuard Security <noreply@authguard.app>',
    subject: 'Action Required: Verify Your AuthGuard Account',
    previewText: `Hi ${params.name}, verify your email to activate your account.`,
    type: 'VERIFICATION',
    actionUrl,
    token: params.token,
    sentAt: new Date().toISOString(),
    textContent: `Hi ${params.name},\n\nThank you for signing up for AuthGuard. Please confirm your email address by opening the following link:\n\n${actionUrl}\n\nThis verification link expires in 24 hours.\n\nIf you did not create this account, please ignore this email.`,
    htmlContent: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; padding: 10px 16px; background-color: #4f46e5; border-radius: 8px; color: #ffffff; font-weight: 700; font-size: 18px;">
            🛡️ AuthGuard
          </div>
        </div>
        <h2 style="color: #0f172a; margin-bottom: 12px; font-size: 22px;">Confirm your email address</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          Hi <strong>${escapeHtml(params.name)}</strong>,<br/>
          Welcome aboard! Please verify your email address to activate your account and access your secure dashboard.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${actionUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-bottom: 16px;">
          Or copy and paste this link into your browser:
        </p>
        <div style="background-color: #f8fafc; padding: 10px 14px; border-radius: 6px; font-family: monospace; font-size: 12px; word-break: break-all; color: #334155; margin-bottom: 24px;">
          ${actionUrl}
        </div>
        <div style="background-color: #f1f5f9; padding: 8px 12px; border-radius: 6px; font-size: 12px; color: #475569; margin-bottom: 24px;">
          <strong>Direct Verification Token:</strong> <code style="color: #4f46e5;">${params.token}</code>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          This verification token expires in 24 hours. If you did not request this account, you can safely disregard this message.
        </p>
      </div>
    `,
  };

  outbox.unshift(message);
  if (outbox.length > 50) outbox.pop();

  console.log(`[MAIL SERVICE] Verification email dispatched to: ${params.toEmail}`);
  console.log(`[MAIL SERVICE] Verification Token: ${params.token}`);
  return message;
}

export function sendPasswordResetEmail(params: {
  toEmail: string;
  name: string;
  token: string;
  appUrl: string;
}): EmailMessage {
  const actionUrl = `${params.appUrl}?action=reset&token=${encodeURIComponent(params.token)}`;
  const message: EmailMessage = {
    id: 'mail_' + crypto.randomBytes(8).toString('hex'),
    to: params.toEmail,
    from: process.env.EMAIL_FROM || 'AuthGuard Security <noreply@authguard.app>',
    subject: 'Important: AuthGuard Password Reset Request',
    previewText: `Hi ${params.name}, follow the link to reset your password.`,
    type: 'PASSWORD_RESET',
    actionUrl,
    token: params.token,
    sentAt: new Date().toISOString(),
    textContent: `Hi ${params.name},\n\nWe received a request to reset your AuthGuard password. Click the following link to choose a new password:\n\n${actionUrl}\n\nThis link is valid for 1 hour.\n\nIf you did not request this, please review your security settings immediately.`,
    htmlContent: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; padding: 10px 16px; background-color: #dc2626; border-radius: 8px; color: #ffffff; font-weight: 700; font-size: 18px;">
            🔐 AuthGuard Security
          </div>
        </div>
        <h2 style="color: #0f172a; margin-bottom: 12px; font-size: 22px;">Reset your password</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          Hi <strong>${escapeHtml(params.name)}</strong>,<br/>
          We received a request to reset your password for your AuthGuard account. Click the button below to set a new password:
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${actionUrl}" style="background-color: #dc2626; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-bottom: 16px;">
          Or copy and paste this link into your browser:
        </p>
        <div style="background-color: #f8fafc; padding: 10px 14px; border-radius: 6px; font-family: monospace; font-size: 12px; word-break: break-all; color: #334155; margin-bottom: 24px;">
          ${actionUrl}
        </div>
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 8px 12px; border-radius: 6px; font-size: 12px; color: #991b1b; margin-bottom: 24px;">
          <strong>Reset Security Token:</strong> <code>${params.token}</code>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
          This reset link will expire in 1 hour. If you didn't initiate this request, someone may be trying to access your account.
        </p>
      </div>
    `,
  };

  outbox.unshift(message);
  if (outbox.length > 50) outbox.pop();

  console.log(`[MAIL SERVICE] Password reset email dispatched to: ${params.toEmail}`);
  console.log(`[MAIL SERVICE] Reset Token: ${params.token}`);
  return message;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
