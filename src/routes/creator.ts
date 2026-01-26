import { Router } from 'express';
import { lookupCreatorSocials } from '../services/socialLookup.js';
import { logger } from '../utils/logger.js';

export const creatorRouter = Router();

creatorRouter.get('/lookup', async (req, res) => {
  const name = req.query.name as string;

  if (!name || name.trim().length === 0) {
    res.status(400).json({
      error: 'Missing required parameter: name',
    });
    return;
  }

  logger.info('Creator lookup request', { name });

  try {
    const result = await lookupCreatorSocials(name.trim());
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Creator lookup failed', { error: message, name });
    res.status(500).json({
      error: 'Lookup failed',
      message,
    });
  }
});
