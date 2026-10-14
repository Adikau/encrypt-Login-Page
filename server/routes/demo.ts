import express, { type Request, type Response } from 'express';
import { clearOutbox, getOutbox } from '../mail.ts';
import { getAllUsersSummary, seedDefaultUsers } from '../db.ts';

export const demoRouter = express.Router();

demoRouter.get('/mail-outbox', (_req: Request, res: Response): void => {
  res.status(200).json({
    count: getOutbox().length,
    messages: getOutbox(),
  });
});

demoRouter.delete('/mail-outbox', (_req: Request, res: Response): void => {
  clearOutbox();
  res.status(200).json({ message: 'Mail outbox cleared' });
});

demoRouter.post('/reset-demo-data', (_req: Request, res: Response): void => {
  seedDefaultUsers();
  clearOutbox();
  res.status(200).json({
    message: 'Demo database reset to initial seed state',
    accounts: [
      {
        email: 'alice@example.com',
        password: 'Password123!',
        role: 'user',
        status: 'Verified (Ready to Login)',
      },
      {
        email: 'bob@example.com',
        password: 'Password123!',
        role: 'user',
        status: 'Unverified (Email Verification Pending)',
      },
      {
        email: 'admin@example.com',
        password: 'AdminSecure2026!',
        role: 'admin',
        status: 'Administrator (Access to Admin Stats)',
      },
    ],
  });
});

demoRouter.get('/users-overview', (_req: Request, res: Response): void => {
  res.status(200).json({
    users: getAllUsersSummary(),
  });
});
