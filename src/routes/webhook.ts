import { Router } from 'express';
import { z } from 'zod';
import { processTranscript } from '../services/processor.js';
import { logger } from '../utils/logger.js';

export const webhookRouter = Router();

const webhookPayloadSchema = z.object({
  transcript: z.string().min(1, 'Transcript is required'),
  title: z.string().optional(),
  date: z.string().optional(),
  attendees: z.array(z.string()).optional(),
});

webhookRouter.post('/', async (req, res) => {
  logger.info('Received webhook request');

  // Validate payload
  const validation = webhookPayloadSchema.safeParse(req.body);

  if (!validation.success) {
    logger.warn('Invalid webhook payload', { errors: validation.error.errors });
    res.status(400).json({
      error: 'Invalid payload',
      details: validation.error.errors,
    });
    return;
  }

  try {
    const result = await processTranscript(validation.data);

    if (result.success) {
      logger.info('Webhook processing complete', {
        contactCount: result.hubspot.contacts?.length,
        dealId: result.hubspot.deal?.id,
      });
      res.json(result);
    } else {
      logger.warn('Webhook processing had errors', { errors: result.errors });
      res.status(207).json(result); // 207 Multi-Status for partial success
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Webhook processing failed', { error: message });
    res.status(500).json({
      error: 'Processing failed',
      message,
    });
  }
});
