import { extractFromTranscript } from './claude.js';
import {
  searchContactByEmail,
  searchContactByName,
  createContact,
  updateContact,
  searchDealByName,
  createDeal,
  addNoteToContact,
  addNoteToDeal,
  buildNoteFromExtraction,
  getContactUrl,
  getDealUrl,
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

  // Step 3: Find or create deal in HubSpot
  let dealId: string | undefined;

  if (extracted.deal.name) {
    try {
      const existingDeal = await searchDealByName(extracted.deal.name);

      if (existingDeal) {
        dealId = existingDeal.id;
        result.hubspot.deal = {
          id: existingDeal.id,
          action: 'found',
          url: getDealUrl(existingDeal.id),
        };
        logger.info('Found existing deal', { id: existingDeal.id });
      } else {
        // Associate deal with first contact if available
        const created = await createDeal(extracted.deal, contactIds[0]);
        dealId = created.id;
        result.hubspot.deal = {
          id: created.id,
          action: 'created',
          url: getDealUrl(created.id),
        };
        logger.info('Created new deal', { id: created.id });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown deal error';
      errors.push(`Deal sync failed: ${message}`);
      logger.error('Deal sync failed', { error: message });
    }
  }

  // Step 4: Add call note to all contacts and deal
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

  if (dealId) {
    try {
      await addNoteToDeal(dealId, noteBody);
      result.hubspot.noteAdded = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown note error';
      errors.push(`Failed to add note to deal: ${message}`);
      logger.error('Failed to add note to deal', { error: message });
    }
  }

  if (errors.length > 0) {
    result.errors = errors;
    result.success = contactIds.length > 0 || dealId !== undefined; // Partial success if something was synced
  }

  return result;
}
