import { extractFromTranscript } from './claude.js';
import {
  searchContactByEmail,
  searchContactByName,
  createContact,
  updateContact,
  addNoteToContact,
  buildNoteFromExtraction,
  getContactUrl,
} from './hubspot.js';
import { logger } from '../utils/logger.js';
import type { TranscriptPayload, ProcessingResult, ExtractedData, ExtractedContact, HubSpotContactResult } from '../types/index.js';

async function syncContact(contact: ExtractedContact): Promise<HubSpotContactResult | null> {
  if (!contact.email && !contact.firstName && !contact.lastName) {
    return null;
  }

  // Try to find by email first
  let existingContact = contact.email
    ? await searchContactByEmail(contact.email)
    : null;

  // If not found by email, try by name
  if (!existingContact && (contact.firstName || contact.lastName)) {
    existingContact = await searchContactByName(
      contact.firstName || '',
      contact.lastName || ''
    );
  }

  if (existingContact) {
    // Update existing contact
    const updated = await updateContact(existingContact.id, contact);
    logger.info('Updated existing contact', { id: updated.id, email: contact.email });
    return {
      id: updated.id,
      action: 'updated',
      url: getContactUrl(updated.id),
      email: contact.email,
      name: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || undefined,
    };
  } else {
    // Create new contact
    const created = await createContact(contact);
    logger.info('Created new contact', { id: created.id, email: contact.email });
    return {
      id: created.id,
      action: 'created',
      url: getContactUrl(created.id),
      email: contact.email,
      name: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || undefined,
    };
  }
}

export async function processTranscript(payload: TranscriptPayload): Promise<ProcessingResult> {
  const errors: string[] = [];
  let extracted: ExtractedData;

  // Step 1: Extract data using Claude
  try {
    extracted = await extractFromTranscript(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown extraction error';
    logger.error('Extraction failed', { error: message });
    return {
      success: false,
      extracted: {
        contacts: [],
        deal: {},
        callSummary: '',
        actionItems: [],
        nextSteps: [],
        sentiment: 'neutral',
      },
      hubspot: { contacts: [], noteAdded: false },
      errors: [`Extraction failed: ${message}`],
    };
  }

  const result: ProcessingResult = {
    success: true,
    extracted,
    hubspot: { contacts: [], noteAdded: false },
    errors: [],
  };

  // Step 2: Find or create contacts in HubSpot (process all contacts)
  const contactIds: string[] = [];

  for (const contact of extracted.contacts) {
    try {
      const contactResult = await syncContact(contact);
      if (contactResult) {
        result.hubspot.contacts.push(contactResult);
        contactIds.push(contactResult.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown contact error';
      const identifier = contact.email || `${contact.firstName} ${contact.lastName}`;
      errors.push(`Contact sync failed for ${identifier}: ${message}`);
      logger.error('Contact sync failed', { error: message, contact: identifier });
    }
  }

  // Step 3: Add call note to all contacts
  const noteBody = buildNoteFromExtraction(extracted);

  for (const contactId of contactIds) {
    try {
      await addNoteToContact(contactId, noteBody);
      result.hubspot.noteAdded = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown note error';
      errors.push(`Failed to add note to contact ${contactId}: ${message}`);
      logger.error('Failed to add note to contact', { error: message, contactId });
    }
  }

  if (errors.length > 0) {
    result.errors = errors;
    result.success = contactIds.length > 0; // Partial success if at least one contact was synced
  }

  return result;
}
