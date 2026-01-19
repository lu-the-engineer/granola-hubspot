import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { config } from '../config.js';

let hashedPassword: string | null = null;

async function getHashedPassword(): Promise<string> {
  if (!hashedPassword) {
    hashedPassword = await bcrypt.hash(config.PASSWORD, 10);
  }
  return hashedPassword;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Skip auth for health check
  if (req.path === '/health') {
    next();
    return;
  }

  // Check for password in header or query
  const password = req.headers['x-password'] as string || req.query.password as string;

  if (!password) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // For simplicity, compare directly (in production, use sessions/tokens)
  if (password === config.PASSWORD) {
    next();
    return;
  }

  // Also support bcrypt-hashed comparison for API calls
  const hashed = await getHashedPassword();
  const isValid = await bcrypt.compare(password, hashed);

  if (isValid) {
    next();
    return;
  }

  res.status(401).json({ error: 'Invalid password' });
}

export function webhookAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Webhook uses a simple token check
  const token = req.headers['x-webhook-token'] as string;

  if (!token || token !== config.PASSWORD) {
    res.status(401).json({ error: 'Invalid webhook token' });
    return;
  }

  next();
}
