import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { authMiddleware, webhookAuthMiddleware } from './middleware/auth.js';
import { healthRouter } from './routes/health.js';
import { webhookRouter } from './routes/webhook.js';
import { uploadRouter } from './routes/upload.js';
import { granolaRouter } from './routes/granola.js';
import { creatorRouter } from './routes/creator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));
app.use(cors());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (public folder)
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/health', healthRouter);
app.use('/webhook', webhookAuthMiddleware, webhookRouter);
app.use('/api', authMiddleware, uploadRouter);
app.use('/api/granola', authMiddleware, granolaRouter);
app.use('/api/creator', authMiddleware, creatorRouter);

// Serve frontend for root
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(config.PORT, () => {
  logger.info(`Granola Assistant running on http://localhost:${config.PORT}`);
});
