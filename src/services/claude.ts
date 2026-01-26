import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type { ExtractedData, TranscriptPayload } from '../types/index.js';

const anthropic = new Anthropic({
  apiKey: config.ANTHROPIC_API_KEY,
});

function buildExtractionPrompt(attendeeEmails: string[]): string {
  const emailList = attendeeEmails.length > 0
    ? `\nATTENDEE EMAILS PROVIDED: ${attendeeEmails.join(', ')}\nIMPORTANT: Use these emails for the contacts. Match each email to the person speaking in the transcript based on their name or role.`
    : '';

  return `You are an AI assistant that extracts structured data from sales call transcripts.
Analyze the provided transcript and extract the following information in JSON format.

IMPORTANT: Only extract information that is explicitly mentioned or strongly implied in the transcript.
Use null for fields where information is not available. Use empty arrays [] when no items found.
${emailList}

Extract:
1. Contact information for ALL external attendees (not internal Fourthwall employees). Each contact needs: firstName, lastName, email, phone, company, jobTitle
2. Deal information (name, stage, amount, closeDate) - no notes needed
3. A concise call summary (2-3 sentences)
4. Action items mentioned during the call
5. Next steps discussed
6. Overall sentiment of the call (positive, neutral, negative)
7. Manufacturing & Product info: products discussed (t-shirts, hoodies, mugs, books, etc.), quantities, materials/fabrics/packaging, production timeline, special requirements, manufacturing concerns
8. Creative/Design info: visual themes, aesthetic directions, inspiration sources, color preferences, brand elements (logos, existing designs), social media links/handles, website URLs

For deal stage, use one of: discovery, qualification, proposal, negotiation, closed_won, closed_lost
Only set a stage if there's clear indication from the conversation.

Respond ONLY with valid JSON matching this schema:
{
  "contacts": [
    {
      "firstName": string | null,
      "lastName": string | null,
      "email": string | null,
      "phone": string | null,
      "company": string | null,
      "jobTitle": string | null
    }
  ],
  "deal": {
    "name": string | null,
    "stage": "discovery" | "qualification" | "proposal" | "negotiation" | "closed_won" | "closed_lost" | null,
    "amount": number | null,
    "closeDate": string | null
  },
  "callSummary": string,
  "actionItems": string[],
  "nextSteps": string[],
  "sentiment": "positive" | "neutral" | "negative",
  "manufacturing": {
    "products": string[],
    "quantities": string | null,
    "materials": string[],
    "timeline": string | null,
    "requirements": string[],
    "concerns": string[]
  },
  "creativeInfo": {
    "themes": string[],
    "inspiration": string[],
    "colors": string[],
    "brandElements": string[],
    "socialLinks": string[],
    "websiteLinks": string[]
  }
}`;
}

export async function extractFromTranscript(payload: TranscriptPayload): Promise<ExtractedData> {
  logger.info('Starting transcript extraction', {
    titleLength: payload.title?.length,
    transcriptLength: payload.transcript.length,
    attendeeCount: payload.attendees?.length || 0,
  });

  // Parse attendees - could be emails or names
  const attendeeEmails = (payload.attendees || []).filter(a => a.includes('@'));

  const userMessage = `
Meeting Title: ${payload.title || 'Unknown'}
Date: ${payload.date || 'Unknown'}
Attendee Emails: ${attendeeEmails.length > 0 ? attendeeEmails.join(', ') : 'Not provided'}

TRANSCRIPT:
${payload.transcript}
`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: buildExtractionPrompt(attendeeEmails) + '\n\n' + userMessage,
      },
    ],
  });

  const textContent = response.content.find(block => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  let jsonStr = textContent.text.trim();

  // Handle markdown code blocks
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  const extracted = JSON.parse(jsonStr) as ExtractedData;

  // If attendee emails were provided but not matched, add them as contacts
  if (attendeeEmails.length > 0) {
    const extractedEmails = new Set(extracted.contacts.map(c => c.email?.toLowerCase()).filter(Boolean));

    for (const email of attendeeEmails) {
      if (!extractedEmails.has(email.toLowerCase())) {
        // Add unmatched email as a contact with just the email
        extracted.contacts.push({ email });
      }
    }
  }

  // Add meeting metadata
  extracted.meetingDate = payload.date;
  extracted.meetingTitle = payload.title;

  logger.info('Extraction complete', {
    contactCount: extracted.contacts.length,
    hasDeal: !!extracted.deal?.name,
    actionItems: extracted.actionItems?.length || 0,
    sentiment: extracted.sentiment,
  });

  return extracted;
}
