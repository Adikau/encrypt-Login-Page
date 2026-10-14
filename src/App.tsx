import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  Lock,
  Mail,
  User,
  Key,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  LogOut,
  ExternalLink,
  FileText,
  Terminal,
  Copy,
  Check,
  Inbox,
  Clock,
  ArrowRight,
  Database,
  AlertTriangle,
  Server,
  Zap,
} from 'lucide-react';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  is_verified: boolean;
  created_at: string;
  last_login_at: string | null;
}

interface OutboxEmail {
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

interface AuditRecord {
  id: string;
  user_id: string | null;
  email: string;
  action: string;
  ip_address: string;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  details: string;
  created_at: string;
}

type AuthTab = 'login' | 'register' | 'verify' | 'forgot' | 'reset';
type MainNav = 'auth' | 'dashboard' | 'outbox' | 'api-tester' | 'docs';

export default function App() {
  const [activeNav, setActiveNav] = useState<MainNav>('auth');
  const [authTab, setAuthTab] = useState<AuthTab>('login');

  // Auth form states
  const [loginEmail, setLoginEmail] = useState('alice@example.com');
  const [loginPassword, setLoginPassword] = useState('Password123!');
  const [showPassword, setShowPassword] = useState(false);

  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');

  const [verifyToken, setVerifyToken] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');

  // Status & Feedback states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  // Authenticated state
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('authguard_token'));
  const [sessionExpiry, setSessionExpiry] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [adminData, setAdminData] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);

  // Outbox / Mail Simulator
  const [outbox, setOutbox] = useState<OutboxEmail[]>([]);
  const [selectedMail, setSelectedMail] = useState<OutboxEmail | null>(null);

  // Docs & API Tester states
  const [docTab, setDocTab] = useState<'deployment' | 'schema' | 'docker' | 'tests'>('deployment');
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Fetch Outbox
  const fetchOutbox = async () => {
    try {
      const res = await fetch('/api/demo/mail-outbox');
      if (res.ok) {
        const data = await res.json();
        setOutbox(data.messages || []);
      }
    } catch (err) {
      console.error('Failed to load outbox', err);
    }
  };

  useEffect(() => {
    fetchOutbox();
    const interval = setInterval(fetchOutbox, 4000);
    return () => clearInterval(interval);
  }, []);

  // Parse URL search params for direct links like ?action=verify&token=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const tokenParam = params.get('token');

    if (tokenParam) {
      if (action === 'verify') {
        setVerifyToken(tokenParam);
        setAuthTab('verify');
        setActiveNav('auth');
      } else if (action === 'reset') {
        setResetToken(tokenParam);
        setAuthTab('reset');
        setActiveNav('auth');
      }
    }
  }, []);

  // Check current session if token exists
  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error('Token expired or invalid');
        })
        .then((data) => {
          setCurrentUser(data.user);
          if (data.session?.expiresAt) {
            setSessionExpiry(data.session.expiresAt);
          }
        })
        .catch(() => {
          // Token is dead
          setToken(null);
          setCurrentUser(null);
          localStorage.removeItem('authguard_token');
        });
    }
  }, [token]);

  // Load Dashboard Data when on dashboard
  useEffect(() => {
    if (activeNav === 'dashboard' && token) {
      loadDashboard();
    }
  }, [activeNav, token]);

  const loadDashboard = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/secure/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setDashboardData(data);
        setAuditLogs(data.auditHistory || []);
        if (data.session?.expiresAt) {
          setSessionExpiry(data.session.expiresAt);
        }
      } else {
        setErrorMsg(data.error || 'Failed to load dashboard');
      }
    } catch (err) {
      setErrorMsg('Network error loading dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  // Password strength calculations
  const passwordCriteria = useMemo(() => {
    const pass = authTab === 'register' ? registerPassword : newPassword;
    return {
      length: pass.length >= 8,
      uppercase: /[A-Z]/.test(pass),
      lowercase: /[a-z]/.test(pass),
      number: /\d/.test(pass),
      special: /[@$!%*?&#^()_\-+=\[\]{}|:;,<.>~`]/.test(pass),
    };
  }, [authTab, registerPassword, newPassword]);

  const passwordScore = useMemo(() => {
    const values = Object.values(passwordCriteria);
    return values.filter(Boolean).length;
  }, [passwordCriteria]);

  // 1. Handle Login
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setUnverifiedEmail(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.unverified) {
          setUnverifiedEmail(loginEmail);
        }
        setErrorMsg(data.error || 'Authentication failed');
      } else {
        setSuccessMsg(`Welcome back, ${data.user.name}!`);
        setCurrentUser(data.user);
        setToken(data.token);
        localStorage.setItem('authguard_token', data.token);
        setActiveNav('dashboard');
        fetchOutbox();
      }
    } catch (err) {
      setErrorMsg('Failed to connect to authentication server');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Handle Registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (registerPassword !== registerConfirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }
    if (passwordScore < 5) {
      setErrorMsg('Please ensure password satisfies all security criteria');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: registerName,
          email: registerEmail,
          password: registerPassword,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Registration failed');
      } else {
        setSuccessMsg(data.message || 'Registration successful! Verification email sent.');
        fetchOutbox();
        if (data.verificationDetails?.token) {
          setVerifyToken(data.verificationDetails.token);
        }
        // Switch to verification view with prefilled token
        setTimeout(() => {
          setAuthTab('verify');
        }, 1500);
      }
    } catch (err) {
      setErrorMsg('Network error during registration');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Handle Verify Email
  const handleVerifyEmail = async (tokenToUse?: string) => {
    const finalToken = tokenToUse || verifyToken;
    if (!finalToken) {
      setErrorMsg('Please supply a verification token');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: finalToken }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Verification failed');
      } else {
        setSuccessMsg(data.message || 'Email successfully verified! You can now log in.');
        fetchOutbox();
        // Prefill email for login
        if (data.user?.email) {
          setLoginEmail(data.user.email);
        }
        setTimeout(() => setAuthTab('login'), 2000);
      }
    } catch (err) {
      setErrorMsg('Network error while verifying token');
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Handle Resend Verification
  const handleResendVerification = async (targetEmail: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to resend verification');
      } else {
        setSuccessMsg(data.message || 'Fresh verification link sent to your email.');
        fetchOutbox();
        if (data.verificationDetails?.token) {
          setVerifyToken(data.verificationDetails.token);
        }
      }
    } catch (err) {
      setErrorMsg('Network error resending verification');
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Handle Forgot Password
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      setErrorMsg('Please enter your email address');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Request failed');
      } else {
        setSuccessMsg(
          data.message || 'If registered, a password reset link has been dispatched to your email.'
        );
        fetchOutbox();
        if (data.resetDetails?.token) {
          setResetToken(data.resetDetails.token);
        }
      }
    } catch (err) {
      setErrorMsg('Network error dispatching password reset');
    } finally {
      setIsLoading(false);
    }
  };

  // 6. Handle Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken) {
      setErrorMsg('Reset token is required');
      return;
    }
    if (newPassword !== newConfirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }
    if (passwordScore < 5) {
      setErrorMsg('Password does not satisfy complexity requirements');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Password reset failed');
      } else {
        setSuccessMsg(data.message || 'Password successfully updated! Please log in.');
        setResetToken('');
        setNewPassword('');
        setNewConfirmPassword('');
        setTimeout(() => setAuthTab('login'), 2000);
      }
    } catch (err) {
      setErrorMsg('Network error resetting password');
    } finally {
      setIsLoading(false);
    }
  };

  // 7. Handle Refresh Token
  const handleRefreshToken = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        localStorage.setItem('authguard_token', data.token);
        setSuccessMsg('Session JWT token refreshed successfully!');
        loadDashboard();
      } else {
        setErrorMsg(data.error || 'Failed to refresh token');
      }
    } catch (err) {
      setErrorMsg('Network error refreshing token');
    } finally {
      setIsLoading(false);
    }
  };

  // 8. Handle Logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // ignore
    }
    setToken(null);
    setCurrentUser(null);
    setDashboardData(null);
    setAdminData(null);
    localStorage.removeItem('authguard_token');
    setActiveNav('auth');
    setAuthTab('login');
    setSuccessMsg('You have been logged out safely.');
  };

  // Quick Seed Credentials Autofill
  const autofillUser = (email: string, pass: string) => {
    setLoginEmail(email);
    setLoginPassword(pass);
    setAuthTab('login');
    setActiveNav('auth');
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  // Reset Demo Database
  const handleResetDemoData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/demo/reset-demo-data', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Demo database reset to clean seeds.');
        fetchOutbox();
        if (token) handleLogout();
      }
    } catch (err) {
      setErrorMsg('Failed to reset demo database');
    } finally {
      setIsLoading(false);
    }
  };

  // Run Custom API tester
  const runApiTest = async (method: string, endpoint: string, body?: any, useAuth = false) => {
    setApiLoading(true);
    setApiResponse(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (useAuth && token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const options: RequestInit = { method, headers };
      if (body) {
        options.body = JSON.stringify(body);
      }

      const startTime = performance.now();
      const res = await fetch(endpoint, options);
      const data = await res.json();
      const duration = Math.round(performance.now() - startTime);

      setApiResponse({
        status: res.status,
        statusText: res.statusText,
        durationMs: duration,
        endpoint,
        method,
        response: data,
      });
    } catch (err: any) {
      setApiResponse({
        status: 500,
        error: err.message || 'Fetch failed',
      });
    } finally {
      setApiLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Banner & Demo Quick Access Bar */}
      <div className="bg-slate-900/90 border-b border-slate-800 text-xs px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-slate-400">Node.js & Express Auth Engine Active</span>
          <span className="bg-slate-800 px-2 py-0.5 rounded text-indigo-400 font-mono">Bcrypt: Cost 12</span>
          <span className="bg-slate-800 px-2 py-0.5 rounded text-amber-400 font-mono">JWT: HS256</span>
        </div>

        {/* Preset seed buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-500 text-[11px] hidden sm:inline">Demo Accounts:</span>
          <button
            onClick={() => autofillUser('alice@example.com', 'Password123!')}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded border border-slate-700 transition flex items-center gap-1.5"
            title="Autofill verified user credentials"
          >
            <CheckCircle2 className="w-3 h-3" /> Alice (Verified)
          </button>
          <button
            onClick={() => autofillUser('bob@example.com', 'Password123!')}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded border border-slate-700 transition flex items-center gap-1.5"
            title="Autofill unverified user credentials"
          >
            <AlertCircle className="w-3 h-3" /> Bob (Unverified)
          </button>
          <button
            onClick={() => autofillUser('admin@example.com', 'AdminSecure2026!')}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-purple-400 rounded border border-slate-700 transition flex items-center gap-1.5"
            title="Autofill administrator credentials"
          >
            <ShieldCheck className="w-3 h-3" /> Admin
          </button>
          <button
            onClick={handleResetDemoData}
            className="px-2 py-1 bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 rounded border border-slate-700 transition flex items-center gap-1"
            title="Reset database to fresh seeds"
          >
            <RefreshCw className="w-3 h-3" /> Reset Seeds
          </button>
        </div>
      </div>

      {/* Main Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg text-white tracking-tight">AuthGuard</h1>
                <span className="text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded">
                  v1.0.0
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Express + Bcrypt Hashing + JWT Sessions + Email Verification
              </p>
            </div>
          </div>

          {/* Navigation Bar */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setActiveNav('auth')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                activeNav === 'auth'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/80'
              }`}
            >
              <Key className="w-4 h-4" />
              <span>Authentication</span>
            </button>

            <button
              onClick={() => {
                if (!token) {
                  setErrorMsg('Please log in to view the secure dashboard');
                  setActiveNav('auth');
                  setAuthTab('login');
                } else {
                  setActiveNav('dashboard');
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 relative ${
                activeNav === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/80'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Protected Dashboard</span>
              {currentUser && (
                <span className="h-2 w-2 rounded-full bg-emerald-400 absolute top-1.5 right-1.5" />
              )}
            </button>

            <button
              onClick={() => setActiveNav('outbox')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 relative ${
                activeNav === 'outbox'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/80'
              }`}
            >
              <Inbox className="w-4 h-4" />
              <span>Mail Outbox</span>
              {outbox.length > 0 && (
                <span className="bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {outbox.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveNav('api-tester')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 hidden md:flex ${
                activeNav === 'api-tester'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/80'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>API Tester</span>
            </button>

            <button
              onClick={() => setActiveNav('docs')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                activeNav === 'docs'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/80'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Docs & Docker</span>
            </button>

            {currentUser && (
              <button
                onClick={handleLogout}
                className="ml-2 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-sm font-medium transition flex items-center gap-1"
                title="Log out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Global Alerts Banner */}
      <div className="max-w-4xl mx-auto w-full px-4 pt-4">
        {errorMsg && (
          <div className="bg-rose-950/80 border border-rose-800/80 text-rose-200 px-4 py-3 rounded-xl mb-4 flex items-start justify-between gap-3 shadow-lg">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">{errorMsg}</p>
                {unverifiedEmail && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => handleResendVerification(unverifiedEmail)}
                      className="text-xs bg-rose-800 hover:bg-rose-700 text-white px-3 py-1 rounded-md font-medium transition flex items-center gap-1"
                    >
                      <Mail className="w-3 h-3" /> Resend Verification Link
                    </button>
                    <button
                      onClick={() => {
                        setAuthTab('verify');
                        setActiveNav('auth');
                      }}
                      className="text-xs text-rose-300 underline hover:text-white"
                    >
                      Enter Token Manually
                    </button>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                setErrorMsg(null);
                setUnverifiedEmail(null);
              }}
              className="text-rose-400 hover:text-white text-xs font-mono"
            >
              ✕
            </button>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-950/80 border border-emerald-800/80 text-emerald-200 px-4 py-3 rounded-xl mb-4 flex items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <p className="text-sm font-medium">{successMsg}</p>
            </div>
            <button
              onClick={() => setSuccessMsg(null)}
              className="text-emerald-400 hover:text-white text-xs font-mono"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* =========================================================================
            VIEW 1: AUTHENTICATION PORTAL (Login, Register, Verify, Forgot, Reset)
           ========================================================================= */}
        {activeNav === 'auth' && (
          <div className="max-w-md mx-auto">
            {/* Auth Sub-nav tabs */}
            <div className="grid grid-cols-5 bg-slate-900 p-1 rounded-xl border border-slate-800 mb-6 text-xs font-medium">
              <button
                onClick={() => {
                  setAuthTab('login');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 rounded-lg transition ${
                  authTab === 'login'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setAuthTab('register');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 rounded-lg transition ${
                  authTab === 'register'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign Up
              </button>
              <button
                onClick={() => {
                  setAuthTab('verify');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 rounded-lg transition ${
                  authTab === 'verify'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Verify
              </button>
              <button
                onClick={() => {
                  setAuthTab('forgot');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 rounded-lg transition ${
                  authTab === 'forgot'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Forgot
              </button>
              <button
                onClick={() => {
                  setAuthTab('reset');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 rounded-lg transition ${
                  authTab === 'reset'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Reset
              </button>
            </div>

            {/* TAB: LOGIN */}
            {authTab === 'login' && (
              <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

                <div className="mb-6">
                  <h2 className="text-xl font-bold text-white tracking-tight">Sign in to your account</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Enter your registered credentials to receive a signed JWT access session.
                  </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotEmail(loginEmail);
                          setAuthTab('forgot');
                        }}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        defaultChecked
                        className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Remember session</span>
                    </label>
                    <span className="text-[11px] text-slate-500 font-mono">Bcrypt verified</span>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-medium py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Verifying credentials...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Sign In</span>
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-6 pt-5 border-t border-slate-800 text-center text-xs text-slate-400">
                  Don't have an account?{' '}
                  <button
                    onClick={() => setAuthTab('register')}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    Create one now
                  </button>
                </div>
              </div>
            )}

            {/* TAB: REGISTER */}
            {authTab === 'register' && (
              <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-6 sm:p-8 shadow-2xl relative">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-white tracking-tight">Create your account</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Passwords are salt-hashed with bcrypt (work factor 12) before database insertion.
                  </p>
                </div>

                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Full Name
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={registerName}
                        onChange={(e) => setRegisterName(e.target.value)}
                        placeholder="Alex Morgan"
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        placeholder="alex@company.com"
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        placeholder="Create strong password"
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Password Strength Meter */}
                    {registerPassword && (
                      <div className="mt-3 p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 text-[11px]">Password Strength:</span>
                          <span
                            className={`font-semibold text-[11px] ${
                              passwordScore === 5
                                ? 'text-emerald-400'
                                : passwordScore >= 3
                                ? 'text-amber-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {passwordScore === 5
                              ? 'Strong (Ready)'
                              : passwordScore >= 3
                              ? 'Moderate'
                              : 'Weak'}
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-1 h-1.5">
                          {[1, 2, 3, 4, 5].map((lvl) => (
                            <div
                              key={lvl}
                              className={`rounded-full h-full ${
                                lvl <= passwordScore
                                  ? passwordScore === 5
                                    ? 'bg-emerald-500'
                                    : passwordScore >= 3
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500'
                                  : 'bg-slate-800'
                              }`}
                            />
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-[11px] pt-1 text-slate-400">
                          <div className={passwordCriteria.length ? 'text-emerald-400' : 'text-slate-500'}>
                            ✓ 8+ Characters
                          </div>
                          <div className={passwordCriteria.uppercase ? 'text-emerald-400' : 'text-slate-500'}>
                            ✓ Uppercase letter
                          </div>
                          <div className={passwordCriteria.lowercase ? 'text-emerald-400' : 'text-slate-500'}>
                            ✓ Lowercase letter
                          </div>
                          <div className={passwordCriteria.number ? 'text-emerald-400' : 'text-slate-500'}>
                            ✓ Number (0-9)
                          </div>
                          <div className={passwordCriteria.special ? 'text-emerald-400' : 'text-slate-500'}>
                            ✓ Special symbol (!@#$)
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type="password"
                        required
                        value={registerConfirmPassword}
                        onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-medium py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Hashing password & creating account...</span>
                      </>
                    ) : (
                      <>
                        <User className="w-4 h-4" />
                        <span>Create Account</span>
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-6 pt-5 border-t border-slate-800 text-center text-xs text-slate-400">
                  Already have an account?{' '}
                  <button
                    onClick={() => setAuthTab('login')}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    Sign in
                  </button>
                </div>
              </div>
            )}

            {/* TAB: VERIFY EMAIL */}
            {authTab === 'verify' && (
              <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-6 sm:p-8 shadow-2xl relative">
                <div className="mb-6 text-center">
                  <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Mail className="w-6 h-6" />
                  </div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Verify Your Email</h2>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Enter the cryptographic verification token sent to your email to activate account access.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Verification Security Token
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={verifyToken}
                        onChange={(e) => setVerifyToken(e.target.value)}
                        placeholder="Paste 64-character hex token..."
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2.5 text-xs font-mono text-white placeholder-slate-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => handleVerifyEmail()}
                    disabled={isLoading || !verifyToken}
                    className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-medium py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                  >
                    {isLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>Confirm & Activate Account</span>
                  </button>

                  <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-400">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-300">Tip: Check Simulated Outbox</span>
                      <button
                        onClick={() => setActiveNav('outbox')}
                        className="text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        Open Outbox <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Emails generated by the Express backend are captured in the Mail Outbox tab for instant 1-click verification testing.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: FORGOT PASSWORD */}
            {authTab === 'forgot' && (
              <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-6 sm:p-8 shadow-2xl relative">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-white tracking-tight">Forgot password?</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Enter your email to generate a time-limited (1-hour) cryptographic password reset link.
                  </p>
                </div>

                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Account Email
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="alice@example.com"
                        className="w-full bg-slate-950 border border-slate-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-medium py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                  >
                    {isLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Key className="w-4 h-4" />
                    )}
                    <span>Send Reset Instructions</span>
                  </button>
                </form>

                <div className="mt-6 pt-5 border-t border-slate-800 text-center text-xs text-slate-400">
                  Remembered your password?{' '}
                  <button
                    onClick={() => setAuthTab('login')}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    Back to Sign In
                  </button>
                </div>
              </div>
            )}

            {/* TAB: RESET PASSWORD */}
            {authTab === 'reset' && (
              <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-6 sm:p-8 shadow-2xl relative">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-white tracking-tight">Set New Password</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Provide the reset token and set a new password meeting security policies.
                  </p>
                </div>

                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Reset Token
                    </label>
                    <input
                      type="text"
                      required
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      placeholder="Paste reset token..."
                      className="w-full bg-slate-950 border border-slate-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-500 outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      New Password
                    </label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New strong password"
                      className="w-full bg-slate-950 border border-slate-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      required
                      value={newConfirmPassword}
                      onChange={(e) => setNewConfirmPassword(e.target.value)}
                      placeholder="Re-type new password"
                      className="w-full bg-slate-950 border border-slate-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-medium py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                  >
                    {isLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Lock className="w-4 h-4" />
                    )}
                    <span>Update Password & Rehash</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            VIEW 2: SECURE DASHBOARD (Authenticated User Session)
           ========================================================================= */}
        {activeNav === 'dashboard' && (
          <div className="space-y-6">
            {!currentUser ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto">
                <Lock className="w-12 h-12 text-amber-400 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-white">Authentication Required</h3>
                <p className="text-xs text-slate-400 mt-2 mb-6">
                  You must be logged in with a valid JWT token to access this protected area.
                </p>
                <button
                  onClick={() => {
                    setActiveNav('auth');
                    setAuthTab('login');
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-sm font-medium transition"
                >
                  Go to Sign In
                </button>
              </div>
            ) : (
              <>
                {/* User Header Summary Card */}
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/20 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold text-xl">
                      {currentUser.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-white">{currentUser.name}</h2>
                        <span
                          className={`text-xs uppercase font-bold px-2 py-0.5 rounded-full ${
                            currentUser.role === 'admin'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          }`}
                        >
                          {currentUser.role}
                        </span>
                        <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Email Verified
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{currentUser.email}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleRefreshToken}
                      disabled={isLoading}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 rounded-xl text-xs font-medium transition flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                      <span>Refresh JWT Token</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-medium transition flex items-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>

                {/* Session & Security Telemetry Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Card 1: JWT Session details */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                        <Key className="w-4 h-4 text-indigo-400" /> Active JWT Session
                      </span>
                      <span className="text-[11px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded font-mono">
                        HS256
                      </span>
                    </div>
                    <div className="text-xs space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Subject (ID):</span>
                        <span className="font-mono text-slate-300 truncate max-w-[160px]">{currentUser.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Expires At:</span>
                        <span className="text-slate-300 font-mono text-[11px]">
                          {sessionExpiry ? new Date(sessionExpiry).toLocaleTimeString() : '15m from issue'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Bearer Token:</span>
                        <button
                          onClick={() => token && handleCopy(token, 'token')}
                          className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono text-[11px]"
                        >
                          {copiedKey === 'token' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          Copy Token
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Password Security Spec */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                        <Shield className="w-4 h-4 text-emerald-400" /> Password Security
                      </span>
                      <span className="text-[11px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono">
                        Bcrypt Cost 12
                      </span>
                    </div>
                    <div className="text-xs space-y-2 text-slate-300">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Hash Algorithm:</span>
                        <span className="font-mono text-slate-300">bcryptjs</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Salt Rounds:</span>
                        <span className="font-mono text-slate-300">12 (4096 iterations)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Last Login:</span>
                        <span className="text-slate-300">
                          {currentUser.last_login_at
                            ? new Date(currentUser.last_login_at).toLocaleTimeString()
                            : 'Just now'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: RBAC Security Guard */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                        <Lock className="w-4 h-4 text-purple-400" /> Privilege Boundaries
                      </span>
                      <span className="text-[11px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded font-mono">
                        RBAC Guard
                      </span>
                    </div>
                    <div className="text-xs space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-500">User Dashboard (/api/secure/dashboard):</span>
                        <span className="text-emerald-400 font-semibold">Granted (200)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Admin API (/api/secure/admin-stats):</span>
                        <span
                          className={`font-semibold ${
                            currentUser.role === 'admin' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {currentUser.role === 'admin' ? 'Granted (200)' : 'Protected (403 Forbidden)'}
                        </span>
                      </div>
                      <div className="pt-1">
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch('/api/secure/admin-stats', {
                                headers: { Authorization: `Bearer ${token}` },
                              });
                              const data = await res.json();
                              setAdminData(data);
                              if (res.ok) {
                                setSuccessMsg('Admin endpoint query returned 200 OK');
                              } else {
                                setErrorMsg(`Forbidden: ${data.error}`);
                              }
                            } catch (e) {
                              setErrorMsg('Admin request failed');
                            }
                          }}
                          className="w-full py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-purple-300 border border-slate-700 rounded-lg text-xs font-medium transition"
                        >
                          Test /api/secure/admin-stats
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Admin Data Panel (if accessed) */}
                {adminData && (
                  <div className="bg-slate-900 border border-purple-500/30 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-purple-400" />
                        <h3 className="font-bold text-white text-sm">
                          Admin Security Portal & Metrics (Protected Route)
                        </h3>
                      </div>
                      <button
                        onClick={() => setAdminData(null)}
                        className="text-xs text-slate-400 hover:text-white font-mono"
                      >
                        Close
                      </button>
                    </div>

                    {adminData.metrics && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                          <span className="text-[11px] text-slate-500 block">Total Accounts</span>
                          <span className="text-lg font-bold text-white">{adminData.metrics.totalAccounts}</span>
                        </div>
                        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                          <span className="text-[11px] text-slate-500 block">Verified Accounts</span>
                          <span className="text-lg font-bold text-emerald-400">
                            {adminData.metrics.verifiedAccounts}
                          </span>
                        </div>
                        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                          <span className="text-[11px] text-slate-500 block">Verification Rate</span>
                          <span className="text-lg font-bold text-indigo-400">
                            {adminData.metrics.verificationRate}
                          </span>
                        </div>
                        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                          <span className="text-[11px] text-slate-500 block">Failed Login Attempts</span>
                          <span className="text-lg font-bold text-rose-400">
                            {adminData.metrics.failedLoginAttemptsCount}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold tracking-wider">
                          <tr>
                            <th className="p-2.5">User</th>
                            <th className="p-2.5">Email</th>
                            <th className="p-2.5">Role</th>
                            <th className="p-2.5">Verification</th>
                            <th className="p-2.5">Last Login</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {adminData.usersDirectory?.map((u: any) => (
                            <tr key={u.id} className="hover:bg-slate-800/40">
                              <td className="p-2.5 font-medium text-white">{u.name}</td>
                              <td className="p-2.5 font-mono text-slate-400">{u.email}</td>
                              <td className="p-2.5 uppercase text-[10px] font-bold">{u.role}</td>
                              <td className="p-2.5">
                                {u.is_verified ? (
                                  <span className="text-emerald-400">Verified</span>
                                ) : (
                                  <span className="text-amber-400">Pending</span>
                                )}
                              </td>
                              <td className="p-2.5 text-slate-500">
                                {u.last_login_at ? new Date(u.last_login_at).toLocaleTimeString() : 'Never'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Audit Log Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-indigo-400" />
                      <h3 className="font-bold text-white text-sm">Security Audit Trail</h3>
                    </div>
                    <span className="text-xs text-slate-500">Last 10 user events</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold tracking-wider">
                        <tr>
                          <th className="p-2.5">Action</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">Details</th>
                          <th className="p-2.5">IP Address</th>
                          <th className="p-2.5">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {auditLogs.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-4 text-center text-slate-500">
                              No audit records found.
                            </td>
                          </tr>
                        ) : (
                          auditLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-800/40">
                              <td className="p-2.5 font-mono text-indigo-300">{log.action}</td>
                              <td className="p-2.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    log.status === 'SUCCESS'
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      : log.status === 'BLOCKED'
                                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  }`}
                                >
                                  {log.status}
                                </span>
                              </td>
                              <td className="p-2.5 text-slate-400">{log.details || '—'}</td>
                              <td className="p-2.5 font-mono text-slate-500">{log.ip_address}</td>
                              <td className="p-2.5 text-slate-500">
                                {new Date(log.created_at).toLocaleTimeString()}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* =========================================================================
            VIEW 3: SIMULATED MAIL OUTBOX
           ========================================================================= */}
        {activeNav === 'outbox' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Inbox className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-lg font-bold text-white">Simulated Email Outbox</h2>
                  <span className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full font-semibold">
                    {outbox.length} Dispatched
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Transactional verification & password reset emails generated by the Express backend appear here in real time.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchOutbox}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh Inbox
                </button>
                <button
                  onClick={async () => {
                    await fetch('/api/demo/mail-outbox', { method: 'DELETE' });
                    setOutbox([]);
                    setSelectedMail(null);
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-rose-950 text-rose-300 rounded-lg text-xs font-medium transition"
                >
                  Clear Outbox
                </button>
              </div>
            </div>

            {outbox.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
                <Mail className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-bold text-white">Outbox is empty</h3>
                <p className="text-xs text-slate-400 mt-1 mb-4">
                  Register a new account or submit "Forgot Password" to trigger a secure transactional email.
                </p>
                <button
                  onClick={() => {
                    setActiveNav('auth');
                    setAuthTab('register');
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-medium transition"
                >
                  Register Demo Account
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Outbox List */}
                <div className="lg:col-span-5 space-y-3">
                  {outbox.map((mail) => (
                    <div
                      key={mail.id}
                      onClick={() => setSelectedMail(mail)}
                      className={`p-4 rounded-xl border cursor-pointer transition text-left ${
                        selectedMail?.id === mail.id
                          ? 'bg-indigo-950/40 border-indigo-500 shadow-lg'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                            mail.type === 'VERIFICATION'
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {mail.type}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {new Date(mail.sentAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-white truncate">{mail.subject}</h4>
                      <p className="text-[11px] text-slate-400 mt-1 truncate">To: {mail.to}</p>
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{mail.previewText}</p>
                    </div>
                  ))}
                </div>

                {/* Email Preview & Action Window */}
                <div className="lg:col-span-7">
                  {selectedMail ? (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                      <div className="border-b border-slate-800 pb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">From: {selectedMail.from}</span>
                          <span className="text-xs text-slate-500 font-mono">
                            {new Date(selectedMail.sentAt).toLocaleString()}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-white mt-1">{selectedMail.subject}</h3>
                        <p className="text-xs text-indigo-400 font-medium mt-0.5">To: {selectedMail.to}</p>
                      </div>

                      {/* Quick 1-click test actions */}
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <span className="text-xs font-semibold text-white block">
                            Quick Automated Testing Action
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Apply this security token without copying manually.
                          </span>
                        </div>

                        {selectedMail.type === 'VERIFICATION' ? (
                          <button
                            onClick={() => {
                              setVerifyToken(selectedMail.token);
                              setActiveNav('auth');
                              setAuthTab('verify');
                              handleVerifyEmail(selectedMail.token);
                            }}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Auto-Verify Email
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setResetToken(selectedMail.token);
                              setActiveNav('auth');
                              setAuthTab('reset');
                            }}
                            className="bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow"
                          >
                            <Key className="w-3.5 h-3.5" /> Auto-Fill Reset Token
                          </button>
                        )}
                      </div>

                      {/* Token Inspector */}
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-slate-400 text-[11px]">Cryptographic Token:</span>
                          <button
                            onClick={() => handleCopy(selectedMail.token, 'mailToken')}
                            className="text-indigo-400 hover:text-indigo-300 text-[11px] flex items-center gap-1"
                          >
                            {copiedKey === 'mailToken' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            Copy
                          </button>
                        </div>
                        <code className="text-indigo-300 break-all font-mono text-[11px]">
                          {selectedMail.token}
                        </code>
                      </div>

                      {/* Rendered HTML Preview */}
                      <div className="border border-slate-800 rounded-xl overflow-hidden bg-white text-slate-900 p-4">
                        <div dangerouslySetInnerHTML={{ __html: selectedMail.htmlContent }} />
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-xs">
                      Select an email message from the list to preview its rendered HTML and direct action links.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            VIEW 4: LIVE API & ROUTE TESTER
           ========================================================================= */}
        {activeNav === 'api-tester' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">Live Authentication API Explorer</h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Trigger real Express endpoints directly from this interactive tester. Observe HTTP status codes, headers, and payload returns.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mt-4">
                <button
                  onClick={() =>
                    runApiTest('POST', '/api/auth/login', {
                      email: 'alice@example.com',
                      password: 'Password123!',
                    })
                  }
                  className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition"
                >
                  <span className="text-[10px] font-bold text-emerald-400 block">POST (200)</span>
                  <span className="text-xs font-semibold text-white">Login Alice</span>
                </button>

                <button
                  onClick={() =>
                    runApiTest('POST', '/api/auth/login', {
                      email: 'bob@example.com',
                      password: 'Password123!',
                    })
                  }
                  className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition"
                >
                  <span className="text-[10px] font-bold text-amber-400 block">POST (403)</span>
                  <span className="text-xs font-semibold text-white">Login Bob (Unverified)</span>
                </button>

                <button
                  onClick={() =>
                    runApiTest('POST', '/api/auth/login', {
                      email: 'alice@example.com',
                      password: 'WrongPassword!',
                    })
                  }
                  className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition"
                >
                  <span className="text-[10px] font-bold text-rose-400 block">POST (401)</span>
                  <span className="text-xs font-semibold text-white">Bad Password</span>
                </button>

                <button
                  onClick={() => runApiTest('GET', '/api/auth/me', undefined, true)}
                  className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition"
                >
                  <span className="text-[10px] font-bold text-indigo-400 block">GET (Auth)</span>
                  <span className="text-xs font-semibold text-white">GET /api/auth/me</span>
                </button>

                <button
                  onClick={() => runApiTest('GET', '/api/secure/dashboard', undefined, true)}
                  className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition"
                >
                  <span className="text-[10px] font-bold text-indigo-400 block">GET (Auth)</span>
                  <span className="text-xs font-semibold text-white">Secure Dashboard</span>
                </button>

                <button
                  onClick={() => runApiTest('GET', '/api/secure/admin-stats', undefined, true)}
                  className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition"
                >
                  <span className="text-[10px] font-bold text-purple-400 block">GET (Admin)</span>
                  <span className="text-xs font-semibold text-white">Admin Stats</span>
                </button>
              </div>
            </div>

            {/* Response Console */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-emerald-400" /> Response Output
                </span>
                {apiResponse && (
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        apiResponse.status >= 200 && apiResponse.status < 300
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : apiResponse.status === 403
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      HTTP {apiResponse.status} {apiResponse.statusText}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">{apiResponse.durationMs}ms</span>
                  </div>
                )}
              </div>

              {apiLoading ? (
                <div className="py-12 text-center text-slate-500 flex items-center justify-center gap-2 text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Executing HTTP request...</span>
                </div>
              ) : apiResponse ? (
                <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto max-h-[400px]">
                  {JSON.stringify(apiResponse, null, 2)}
                </pre>
              ) : (
                <div className="py-8 text-center text-slate-500 text-xs">
                  Click any endpoint button above to execute a real-time request and inspect the response.
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            VIEW 5: DEPLOYMENT, DOCKER & DOCUMENTATION
           ========================================================================= */}
        {activeNav === 'docs' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-400" /> Setup & Deployment Documentation
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Complete reference for environment configuration, relational database schema, Docker containerization, and unit tests.
                  </p>
                </div>

                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
                  <button
                    onClick={() => setDocTab('deployment')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      docTab === 'deployment' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    DEPLOYMENT.md
                  </button>
                  <button
                    onClick={() => setDocTab('schema')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      docTab === 'schema' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    schema.sql
                  </button>
                  <button
                    onClick={() => setDocTab('docker')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      docTab === 'docker' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Dockerfile & Compose
                  </button>
                  <button
                    onClick={() => setDocTab('tests')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      docTab === 'tests' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Unit Tests (14 Specs)
                  </button>
                </div>
              </div>
            </div>

            {/* TAB CONTENT: DEPLOYMENT.MD */}
            {docTab === 'deployment' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl text-xs space-y-6">
                <div>
                  <h3 className="text-base font-bold text-white mb-2">1. Environment Variables Configuration</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border border-slate-800 rounded-lg overflow-hidden">
                      <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold">
                        <tr>
                          <th className="p-3">Variable</th>
                          <th className="p-3">Default Value</th>
                          <th className="p-3">Purpose</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        <tr>
                          <td className="p-3 font-mono text-indigo-300">PORT</td>
                          <td className="p-3 font-mono">3000</td>
                          <td className="p-3">Port for the Express HTTP server</td>
                        </tr>
                        <tr>
                          <td className="p-3 font-mono text-indigo-300">JWT_SECRET</td>
                          <td className="p-3 font-mono text-amber-300">High entropy secret</td>
                          <td className="p-3">Secret key for signing 15-minute access tokens</td>
                        </tr>
                        <tr>
                          <td className="p-3 font-mono text-indigo-300">JWT_REFRESH_SECRET</td>
                          <td className="p-3 font-mono text-amber-300">Distinct secret</td>
                          <td className="p-3">Secret key for signing 7-day refresh tokens</td>
                        </tr>
                        <tr>
                          <td className="p-3 font-mono text-indigo-300">BCRYPT_SALT_ROUNDS</td>
                          <td className="p-3 font-mono">12</td>
                          <td className="p-3">Password hash cost factor (GPU brute-force defense)</td>
                        </tr>
                        <tr>
                          <td className="p-3 font-mono text-indigo-300">DATABASE_URL</td>
                          <td className="p-3 font-mono">postgres://...</td>
                          <td className="p-3">PostgreSQL/MySQL relational connection URI</td>
                        </tr>
                        <tr>
                          <td className="p-3 font-mono text-indigo-300">SMTP_HOST / USER / PASS</td>
                          <td className="p-3 font-mono">smtp.mailtrap.io</td>
                          <td className="p-3">Production mail server settings</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-bold text-white mb-2">2. Running in Production with Docker</h3>
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 space-y-2">
                    <p className="text-slate-500"># Step 1: Build production container image</p>
                    <p className="text-emerald-300">docker build -t authguard:latest .</p>
                    <p className="text-slate-500"># Step 2: Spin up app + PostgreSQL database with Docker Compose</p>
                    <p className="text-emerald-300">docker-compose up -d</p>
                    <p className="text-slate-500"># Step 3: Check healthy container status</p>
                    <p className="text-emerald-300">docker-compose ps</p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: SCHEMA.SQL */}
            {docTab === 'schema' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-sm font-bold text-white">schema.sql (PostgreSQL / ANSI SQL DDL)</h3>
                  </div>
                  <button
                    onClick={() =>
                      handleCopy(
                        `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification_token VARCHAR(128) NULL,
    verification_token_expires_at TIMESTAMP NULL,
    reset_password_token VARCHAR(128) NULL,
    reset_password_expires_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL
);`,
                        'schemaSql'
                      )
                    }
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    {copiedKey === 'schemaSql' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy Schema
                  </button>
                </div>

                <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-indigo-300 overflow-x-auto max-h-[500px]">
{`-- Users Table: includes verification status and reset tokens
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

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
CREATE INDEX IF NOT EXISTS idx_users_reset_password_token ON users(reset_password_token);

-- Security Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NULL,
    email VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    status VARCHAR(20) NOT NULL,
    details TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);`}
                </pre>
              </div>
            )}

            {/* TAB CONTENT: DOCKER */}
            {docTab === 'docker' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Server className="w-4 h-4 text-indigo-400" /> Multi-Stage Dockerfile
                    </span>
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                      Alpine 3.20 + Node 22
                    </span>
                  </div>
                  <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-[420px]">
{`FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000
RUN apk add --no-cache dumb-init curl
RUN mkdir -p /app/.data && chown -R node:node /app
COPY --chown=node:node package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/server ./server
COPY --chown=node:node --from=builder /app/server.ts ./server.ts

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s \\
  CMD curl -f http://localhost:3000/api/health || exit 1
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["npx", "tsx", "server.ts"]`}
                  </pre>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Database className="w-4 h-4 text-emerald-400" /> docker-compose.yml
                    </span>
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                      Postgres 16 + App
                    </span>
                  </div>
                  <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-[420px]">
{`services:
  authguard-app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=change-in-production-2026
      - DATABASE_URL=postgres://authuser:pass@postgres:5432/authguard_db
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - app_data:/app/.data

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=authuser
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=authguard_db
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./schema.sql:/docker-entrypoint-initdb.d/init.sql`}
                  </pre>
                </div>
              </div>
            )}

            {/* TAB CONTENT: UNIT TESTS */}
            {docTab === 'tests' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Automated Test Suite (Vitest + Supertest)
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      14 automated tests covering all authentication routes, bcrypt password hashing, token validation, and secure endpoints.
                    </p>
                  </div>
                  <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full font-bold">
                    14 / 14 Passing
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="font-semibold text-emerald-400 block mb-1">✓ POST /api/auth/register</span>
                    <span className="text-slate-400 text-[11px]">
                      Registers user, hashes password with bcrypt (cost 12), generates 24h verification token.
                    </span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="font-semibold text-emerald-400 block mb-1">✓ Duplicate Email Prevention</span>
                    <span className="text-slate-400 text-[11px]">
                      Rejects duplicate email registration with 409 Conflict.
                    </span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="font-semibold text-emerald-400 block mb-1">✓ Password Complexity Validation</span>
                    <span className="text-slate-400 text-[11px]">
                      Rejects weak passwords missing uppercase, numbers, or special symbols (400).
                    </span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="font-semibold text-emerald-400 block mb-1">✓ Invalid Credentials Handling</span>
                    <span className="text-slate-400 text-[11px]">
                      Returns 401 Unauthorized for bad passwords and logs failed audit event.
                    </span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="font-semibold text-emerald-400 block mb-1">✓ Unverified Account Lock</span>
                    <span className="text-slate-400 text-[11px]">
                      Returns 403 Forbidden with `unverified: true` until email is confirmed.
                    </span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="font-semibold text-emerald-400 block mb-1">✓ Email Verification Flow</span>
                    <span className="text-slate-400 text-[11px]">
                      Validates token, activates account in database, invalidates used token.
                    </span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="font-semibold text-emerald-400 block mb-1">✓ Password Reset Lifecycle</span>
                    <span className="text-slate-400 text-[11px]">
                      Issues 1-hour token, re-hashes new password, invalidates old credentials.
                    </span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="font-semibold text-emerald-400 block mb-1">✓ Role-Based Authorization Guard</span>
                    <span className="text-slate-400 text-[11px]">
                      Protects /api/secure/admin-stats, returning 403 for users and 200 for admins.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Global Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 text-slate-500 text-xs py-4 px-4 text-center">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <span>AuthGuard Security Suite • Express & Node.js • Bcrypt Work Factor 12 • JWT Session Engine</span>
          <span className="font-mono text-[11px] text-slate-400">Environment: {process.env.NODE_ENV || 'production'}</span>
        </div>
      </footer>
    </div>
  );
}
