# AuthGuard Deployment & Setup Guide

A production-grade Node.js & Express authentication suite implementing secure **bcrypt** password hashing, **JWT-based session management**, **email verification**, and **secure password reset workflows**.

---

## 1. System Architecture & Features

- **Password Security**: Salted hashing via `bcryptjs` with cost factor 12 (work factor tuned for defense against offline dictionary and brute-force GPU attacks).
- **Session Management**: Dual-token JWT architecture:
  - **Access Token**: Short-lived (15 minutes), transmitted via `Authorization: Bearer <token>` or HTTP-Only cookie.
  - **Refresh Token**: Long-lived (7 days), stored in HTTP-Only, SameSite, Secure cookie.
- **Account Verification**: Cryptographic token generation (`crypto.randomBytes(32).toString('hex')`) with a 24-hour expiration window.
- **Password Reset**: Cryptographic reset token generation with 1-hour expiration and tamper validation.
- **Audit Logging**: Every authentication event, failed attempt, verification, and reset is recorded with timestamp, IP address, and user agent.
- **Role-Based Access Control (RBAC)**: Route middleware enforcing `admin` and `user` privilege boundaries.

---

## 2. Environment Variables Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | Number | `3000` | Port on which the Express server listens. |
| `NODE_ENV` | String | `development` | Set to `production` in staging & production environments. |
| `APP_URL` | String | `http://localhost:3000` | Fully qualified base URL used in email links. |
| `JWT_SECRET` | String | *Required in prod* | High-entropy secret for signing access tokens (`openssl rand -base64 48`). |
| `JWT_EXPIRES_IN` | String | `15m` | Lifetime of the access token (e.g. `15m`, `1h`). |
| `JWT_REFRESH_SECRET` | String | *Required in prod* | Secret for signing refresh tokens (`openssl rand -base64 48`). |
| `JWT_REFRESH_EXPIRES_IN` | String | `7d` | Lifetime of the refresh token (e.g. `7d`, `30d`). |
| `BCRYPT_SALT_ROUNDS` | Number | `12` | Bcrypt hashing work factor (recommended: 12). |
| `DATABASE_URL` | String | `postgres://...` | Connection URI for production database. |
| `SMTP_HOST` | String | `smtp.mailtrap.io` | SMTP mail server hostname. |
| `SMTP_PORT` | Number | `587` | SMTP port (465 for SSL, 587 for STARTTLS). |
| `SMTP_USER` | String | *Optional in dev* | SMTP authentication username. |
| `SMTP_PASS` | String | *Optional in dev* | SMTP authentication password. |
| `EMAIL_FROM` | String | `AuthGuard <noreply@...>` | Sender header for transactional emails. |

---

## 3. Database Schema Setup

The relational schema is defined in `schema.sql`. It includes `users`, `refresh_tokens`, and `audit_logs` tables with appropriate indexes and foreign keys.

To apply the schema to a PostgreSQL instance:

```bash
psql -U postgres -d authguard_db -f schema.sql
```

For MySQL / MariaDB:

```bash
mysql -u root -p authguard_db < schema.sql
```

---

## 4. Local Development Setup

### Prerequisites
- Node.js >= 20.0.0
- npm or yarn

### Steps
1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the full-stack server (Express backend + Vite client middleware):
   ```bash
   npm run dev
   ```

3. Open your browser at:
   ```
   http://localhost:3000
   ```

4. Run the automated unit tests:
   ```bash
   npm test
   ```

---

## 5. Docker Containerization Steps

### 5.1 Build the Production Docker Image
Run the following command from the root directory:

```bash
docker build -t authguard:latest .
```

*Note: The Dockerfile uses a multi-stage Alpine build, runs under an unprivileged `node` user, and includes `HEALTHCHECK` and `dumb-init` signal handling.*

### 5.2 Run the Single Container
```bash
docker run -d \
  --name authguard-app \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=$(openssl rand -base64 48) \
  -e JWT_REFRESH_SECRET=$(openssl rand -base64 48) \
  -v authguard_data:/app/.data \
  authguard:latest
```

### 5.3 Multi-Container Orchestration with Docker Compose
The provided `docker-compose.yml` launches both the AuthGuard application and a PostgreSQL database container with automatic initialization via `schema.sql`:

```bash
# Start all services in the background
docker-compose up -d

# Check service status and health checks
docker-compose ps

# View real-time application logs
docker-compose logs -f authguard-app

# Stop the containers
docker-compose down
```

---

## 6. API Route Reference

### Authentication Endpoints
- `POST /api/auth/register`: Create account with password hashing and verification token.
- `POST /api/auth/login`: Authenticate with bcrypt check, verified email check, and JWT issuance.
- `POST /api/auth/verify-email`: Verify email with token.
- `POST /api/auth/resend-verification`: Resend confirmation token.
- `POST /api/auth/forgot-password`: Dispatch password reset link.
- `POST /api/auth/reset-password`: Validate token & set new bcrypt-hashed password.
- `POST /api/auth/refresh`: Issue fresh access token from refresh token.
- `POST /api/auth/logout`: Clear cookies and invalidate session.
- `GET /api/auth/me`: Retrieve current user profile (requires Bearer token).

### Protected & Secure Endpoints
- `GET /api/secure/dashboard`: Authenticated user dashboard with telemetry & audit log.
- `GET /api/secure/admin-stats`: Admin-only endpoint guarded by `requireRole('admin')`.

---

## 7. Security Hardening Checklist for Production

1. **HTTPS Enforcement**: Always deploy behind a TLS terminator (e.g. Nginx, Cloudflare, AWS ALB) and ensure cookies have the `Secure` flag enabled.
2. **Key Rotation**: Store `JWT_SECRET` and `JWT_REFRESH_SECRET` in secret vaults (AWS Secrets Manager, GCP Secret Manager, or HashiCorp Vault).
3. **Rate Limiting**: Configure reverse proxy or express rate limiting (`express-rate-limit`) on `/api/auth/login` to prevent credential stuffing.
4. **CORS Policy**: Restrict allowed origins to your production frontend domain.
