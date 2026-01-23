import { Router, Request, Response } from 'express';
import { getGranolaService } from '../services/granola.js';
import { logger } from '../utils/logger.js';

export const granolaRouter = Router();

/**
 * GET /granola/meetings
 * List available Granola meetings
 */
granolaRouter.get('/meetings', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const apiToken = req.headers['x-granola-token'] as string | undefined;

    const granola = getGranolaService(apiToken);
    const meetings = await granola.listMeetings(limit);

    // Return simplified list (without full transcripts)
    const meetingList = meetings.map(m => ({
      id: m.id,
      title: m.title,
      date: m.date,
      duration: m.duration,
      participantCount: m.participants.length,
      participants: m.participants.map(p => ({
        name: p.name,
        email: p.email,
      })),
      hasSummary: !!m.summary,
      hasTranscript: m.hasTranscript ?? true, // Default to true for API results
    }));

    res.json({ meetings: meetingList });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Failed to list Granola meetings', { error: message });
    res.status(500).json({
      error: 'Failed to load meetings',
      message,
      hint: 'Make sure Granola desktop app is installed, or provide X-Granola-Token header',
    });
  }
});

/**
 * GET /granola/meetings/:id
 * Get a specific meeting with full transcript
 */
granolaRouter.get('/meetings/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const apiToken = req.headers['x-granola-token'] as string | undefined;

    const granola = getGranolaService(apiToken);
    const meeting = await granola.getMeeting(id);

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    res.json({ meeting });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Failed to get Granola meeting', { error: message, id: req.params.id });
    res.status(500).json({ error: 'Failed to load meeting', message });
  }
});
