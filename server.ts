import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { authRouter } from './server/routes/auth.ts';
import { secureRouter } from './server/routes/secure.ts';
import { demoRouter } from './server/routes/demo.ts';
import { initDatabase } from './server/db.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Initialize database
initDatabase();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/secure', secureRouter);
app.use('/api/demo', demoRouter);

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    service: 'AuthGuard Authentication Service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  // Only listen if not imported by test runner
  if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 AuthGuard Server running on http://localhost:${PORT}`);
      console.log(`🔐 Bcrypt Salt Rounds: ${process.env.BCRYPT_SALT_ROUNDS || 12}`);
      console.log(`🎫 JWT Session Management Active`);
    });
  }
}

// Start if running as entry file
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
