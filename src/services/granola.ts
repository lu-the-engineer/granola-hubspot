import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface GranolaMeeting {
  id: string;
  title: string;
  date: string;
  duration?: number;
  participants: GranolaParticipant[];
  transcript?: string;
  summary?: string;
}

export interface GranolaParticipant {
  name: string;
  email?: string;
  isHost?: boolean;
}

// Cache file structure
interface GranolaCacheFile {
  cache: string; // JSON string that needs to be parsed
}

interface GranolaCacheState {
  documents: Record<string, GranolaCacheDocument>;
  transcripts: Record<string, GranolaTranscriptEntry[]>;
  events: GranolaCalendarEvent[];
  meetingsMetadata: Record<string, GranolaMeetingMetadata>;
}

interface GranolaCacheDocument {
  id: string;
  title?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  type?: string;
  notes_plain?: string;
  notes_markdown?: string;
  google_calendar_event?: {
    id: string;
    summary?: string;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
    attendees?: Array<{
      email?: string;
      displayName?: string;
      organizer?: boolean;
      self?: boolean;
      responseStatus?: string;
    }>;
    creator?: { email?: string };
    organizer?: { email?: string };
  };
  people?: {
    attendees?: Array<{
      name?: string;
      email?: string;
      details?: {
        person?: {
          name?: { fullName?: string };
          employment?: { title?: string; company?: string };
        };
      };
    }>;
  };
}

interface GranolaTranscriptEntry {
  id: string;
  document_id: string;
  start_timestamp: string;
  end_timestamp: string;
  text: string;
  source?: string;
  speaker?: string;
  is_final?: boolean;
}

interface GranolaCalendarEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  attendees?: Array<{
    email?: string;
    displayName?: string;
    organizer?: boolean;
    self?: boolean;
  }>;
}

interface GranolaMeetingMetadata {
  title?: string;
  created_at?: string;
  attendees?: Array<{
    name?: string;
    email?: string;
  }>;
}

const GRANOLA_CACHE_PATH = path.join(
  os.homedir(),
  'Library/Application Support/Granola/cache-v3.json'
);

const GRANOLA_API_BASE = 'https://api.granola.ai';

export class GranolaService {
  private apiToken?: string;

  constructor(apiToken?: string) {
    this.apiToken = apiToken;
  }

  /**
   * List meetings from either local cache or API
   */
  async listMeetings(limit = 50): Promise<GranolaMeeting[]> {
    // Try local cache first
    try {
      const meetings = await this.listFromLocalCache(limit);
      if (meetings.length > 0) {
        logger.info(`Loaded ${meetings.length} meetings from local cache`);
        return meetings;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.debug('Local cache not available', { error: message });
    }

    // Fall back to API if token provided
    if (this.apiToken) {
      return this.listFromApi(limit);
    }

    throw new Error('No Granola data source available. Install Granola desktop app or provide API token.');
  }

  /**
   * Get a specific meeting with full transcript
   */
  async getMeeting(id: string): Promise<GranolaMeeting | null> {
    // Try local cache first
    try {
      const meeting = await this.getMeetingFromCache(id);
      if (meeting) {
        return meeting;
      }
    } catch (err) {
      logger.debug('Meeting not found in local cache');
    }

    // Fall back to API
    if (this.apiToken) {
      return this.getMeetingFromApi(id);
    }

    return null;
  }

  /**
   * Parse the Granola cache file
   */
  private async parseCache(): Promise<GranolaCacheState> {
    const cacheData = await fs.readFile(GRANOLA_CACHE_PATH, 'utf-8');
    const cacheFile: GranolaCacheFile = JSON.parse(cacheData);
    const innerCache = JSON.parse(cacheFile.cache);
    return innerCache.state as GranolaCacheState;
  }

  /**
   * Read meetings from Granola's local cache file
   */
  private async listFromLocalCache(limit: number): Promise<GranolaMeeting[]> {
    const state = await this.parseCache();

    if (!state.documents || typeof state.documents !== 'object') {
      return [];
    }

    // Convert documents object to array and filter
    const docs = Object.values(state.documents)
      .filter(doc => !doc.deleted_at) // Exclude deleted
      .filter(doc => doc.type === 'meeting') // Only meetings
      .sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB.getTime() - dateA.getTime(); // Newest first
      })
      .slice(0, limit);

    return docs.map(doc => this.transformCacheDocument(doc, state));
  }

  private async getMeetingFromCache(id: string): Promise<GranolaMeeting | null> {
    const state = await this.parseCache();

    const doc = state.documents?.[id];
    if (!doc || doc.deleted_at) return null;

    return this.transformCacheDocument(doc, state, true);
  }

  private transformCacheDocument(
    doc: GranolaCacheDocument,
    state: GranolaCacheState,
    includeTranscript = false
  ): GranolaMeeting {
    // Extract participants from google_calendar_event or people
    const participants: GranolaParticipant[] = [];

    // Try google_calendar_event attendees first
    const calEvent = doc.google_calendar_event;
    if (calEvent?.attendees) {
      for (const a of calEvent.attendees) {
        if (a.self) continue; // Skip self
        participants.push({
          name: a.displayName || a.email?.split('@')[0] || 'Unknown',
          email: a.email,
          isHost: a.organizer,
        });
      }
    }

    // Also check people.attendees for additional info
    if (doc.people?.attendees) {
      for (const a of doc.people.attendees) {
        // Check if already added
        if (a.email && participants.some(p => p.email === a.email)) {
          continue;
        }
        participants.push({
          name: a.name || a.details?.person?.name?.fullName || 'Unknown',
          email: a.email,
        });
      }
    }

    // Also check meetingsMetadata for attendees
    const metadata = state.meetingsMetadata?.[doc.id];
    if (metadata?.attendees) {
      for (const a of metadata.attendees) {
        if (a.email && participants.some(p => p.email === a.email)) {
          continue;
        }
        participants.push({
          name: a.name || a.email?.split('@')[0] || 'Unknown',
          email: a.email,
        });
      }
    }

    // Calculate duration if we have calendar event times
    let duration: number | undefined;
    if (calEvent?.start?.dateTime && calEvent?.end?.dateTime) {
      const start = new Date(calEvent.start.dateTime);
      const end = new Date(calEvent.end.dateTime);
      duration = Math.round((end.getTime() - start.getTime()) / 60000); // minutes
    }

    // Get transcript if requested
    let transcript: string | undefined;
    if (includeTranscript && state.transcripts?.[doc.id]) {
      const entries = state.transcripts[doc.id];
      transcript = entries
        .filter(e => e.text && e.text.trim())
        .map(e => {
          const speaker = e.speaker ? `${e.speaker}: ` : '';
          return `${speaker}${e.text}`;
        })
        .join('\n');
    }

    // Get meeting date from calendar event or created_at
    const meetingDate = calEvent?.start?.dateTime || doc.created_at || new Date().toISOString();

    return {
      id: doc.id,
      title: doc.title || calEvent?.summary || 'Untitled Meeting',
      date: meetingDate,
      duration,
      participants,
      transcript,
      summary: doc.notes_markdown || doc.notes_plain,
    };
  }

  /**
   * List meetings from Granola API (reverse-engineered)
   */
  private async listFromApi(limit: number): Promise<GranolaMeeting[]> {
    if (!this.apiToken) {
      throw new Error('API token required');
    }

    const response = await fetch(`${GRANOLA_API_BASE}/v2/get-documents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        'X-Client-Version': '1.0.0',
      },
      body: JSON.stringify({
        limit,
        offset: 0,
        include_last_viewed_panel: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Granola API error', { status: response.status, error: errorText });
      throw new Error(`Granola API error: ${response.status}`);
    }

    const data = (await response.json()) as { documents?: any[] };

    // Transform API response to our format
    return (data.documents || []).map((doc: any) => ({
      id: doc.id,
      title: doc.title || 'Untitled Meeting',
      date: doc.meeting_starts_at || doc.created_at,
      duration: doc.duration_minutes,
      participants: (doc.attendees || []).map((a: any) => ({
        name: a.name || a.email?.split('@')[0] || 'Unknown',
        email: a.email,
        isHost: a.is_organizer,
      })),
      summary: doc.summary,
    }));
  }

  private async getMeetingFromApi(id: string): Promise<GranolaMeeting | null> {
    if (!this.apiToken) {
      throw new Error('API token required');
    }

    // First get document details
    const docsResponse = await fetch(`${GRANOLA_API_BASE}/v1/get-documents-batch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        'X-Client-Version': '1.0.0',
      },
      body: JSON.stringify({ document_ids: [id] }),
    });

    if (!docsResponse.ok) {
      return null;
    }

    const docsData = (await docsResponse.json()) as { documents?: any[] };
    const doc = docsData.documents?.[0];
    if (!doc) return null;

    // Get transcript
    const transcriptResponse = await fetch(`${GRANOLA_API_BASE}/v1/get-document-transcript`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        'X-Client-Version': '1.0.0',
      },
      body: JSON.stringify({ document_id: id }),
    });

    let transcript: string | undefined;
    if (transcriptResponse.ok) {
      const transcriptData = (await transcriptResponse.json()) as { transcript?: string };
      transcript = transcriptData.transcript;
    }

    return {
      id: doc.id,
      title: doc.title || 'Untitled Meeting',
      date: doc.meeting_starts_at || doc.created_at,
      duration: doc.duration_minutes,
      participants: (doc.attendees || []).map((a: any) => ({
        name: a.name || a.email?.split('@')[0] || 'Unknown',
        email: a.email,
        isHost: a.is_organizer,
      })),
      transcript,
      summary: doc.summary,
    };
  }
}

// Singleton instance (token can be set later)
let granolaService: GranolaService | null = null;

export function getGranolaService(apiToken?: string): GranolaService {
  if (!granolaService || apiToken) {
    granolaService = new GranolaService(apiToken);
  }
  return granolaService;
}
