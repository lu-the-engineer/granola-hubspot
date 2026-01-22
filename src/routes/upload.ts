import { Router } from 'express';
import { z } from 'zod';
import { processTranscript } from '../services/processor.js';
import { logger } from '../utils/logger.js';

export const uploadRouter = Router();

const uploadPayloadSchema = z.object({
  transcript: z.string().min(1, 'Transcript is required'),
  title: z.string().optional(),
  date: z.string().optional(),
  attendees: z.string().optional(), // Comma-separated for form input
});

uploadRouter.post('/upload', async (req, res) => {
  logger.info('Received upload request');

  // Validate payload
  const validation = uploadPayloadSchema.safeParse(req.body);

  if (!validation.success) {
    logger.warn('Invalid upload payload', { errors: validation.error.errors });
    res.status(400).json({
      error: 'Invalid payload',
      details: validation.error.errors,
    });
    return;
  }

  // Parse attendees from comma-separated string
  const attendees = validation.data.attendees
    ? validation.data.attendees.split(',').map(a => a.trim()).filter(Boolean)
    : undefined;

  try {
    const result = await processTranscript({
      transcript: validation.data.transcript,
      title: validation.data.title,
      date: validation.data.date,
      attendees,
    });

    if (result.success) {
      logger.info('Upload processing complete', {
        contactCount: result.hubspot.contacts?.length,
        dealId: result.hubspot.deal?.id,
      });
      res.json(result);
    } else {
      logger.warn('Upload processing had errors', { errors: result.errors });
      res.status(207).json(result);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Upload processing failed', { error: message });
    res.status(500).json({
      error: 'Processing failed',
      message,
    });
  }
});
