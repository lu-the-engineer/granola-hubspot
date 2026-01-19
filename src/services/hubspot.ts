import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type { ExtractedData, ExtractedContact, HubSpotContact, HubSpotDeal } from '../types/index.js';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

interface HubSpotSearchResult<T> {
  total: number;
  results: T[];
}

async function hubspotRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
  body?: unknown
): Promise<T> {
  const url = `${HUBSPOT_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${config.HUBSPOT_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('HubSpot API error', { status: response.status, error: errorText });
    throw new Error(`HubSpot API error: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<T>;
}

export async function searchContactByEmail(email: string): Promise<HubSpotContact | null> {
  if (!email) return null;

  const result = await hubspotRequest<HubSpotSearchResult<HubSpotContact>>(
    '/crm/v3/objects/contacts/search',
    'POST',
    {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'email',
              operator: 'EQ',
              value: email,
            },
          ],
        },
      ],
      properties: ['firstname', 'lastname', 'email', 'phone', 'company', 'jobtitle'],
    }
  );

  return result.results[0] || null;
}

export async function searchContactByName(firstName: string, lastName: string): Promise<HubSpotContact | null> {
  if (!firstName && !lastName) return null;

  const filters = [];
  if (firstName) {
    filters.push({
      propertyName: 'firstname',
      operator: 'CONTAINS_TOKEN',
      value: firstName,
    });
  }
  if (lastName) {
    filters.push({
      propertyName: 'lastname',
      operator: 'CONTAINS_TOKEN',
      value: lastName,
    });
  }

  const result = await hubspotRequest<HubSpotSearchResult<HubSpotContact>>(
    '/crm/v3/objects/contacts/search',
    'POST',
    {
      filterGroups: [{ filters }],
      properties: ['firstname', 'lastname', 'email', 'phone', 'company', 'jobtitle'],
    }
  );

  return result.results[0] || null;
}

export async function createContact(data: ExtractedContact): Promise<HubSpotContact> {
  const properties: Record<string, string> = {};

  if (data.firstName) properties.firstname = data.firstName;
  if (data.lastName) properties.lastname = data.lastName;
  if (data.email) properties.email = data.email;
  if (data.phone) properties.phone = data.phone;
  if (data.company) properties.company = data.company;
  if (data.jobTitle) properties.jobtitle = data.jobTitle;

  const result = await hubspotRequest<HubSpotContact>(
    '/crm/v3/objects/contacts',
    'POST',
    { properties }
  );

  logger.info('Created HubSpot contact', { id: result.id });
  return result;
}

export async function updateContact(
  contactId: string,
  data: ExtractedContact
): Promise<HubSpotContact> {
  const properties: Record<string, string> = {};

  if (data.firstName) properties.firstname = data.firstName;
  if (data.lastName) properties.lastname = data.lastName;
  if (data.phone) properties.phone = data.phone;
  if (data.company) properties.company = data.company;
  if (data.jobTitle) properties.jobtitle = data.jobTitle;

  // If no properties to update, just return the existing contact info
  if (Object.keys(properties).length === 0) {
    logger.info('No properties to update for contact', { id: contactId });
    return { id: contactId, properties: {} };
  }

  // Don't update email as it's typically used for identification
  const result = await hubspotRequest<HubSpotContact>(
    `/crm/v3/objects/contacts/${contactId}`,
    'PATCH',
    { properties }
  );

  logger.info('Updated HubSpot contact', { id: result.id });
  return result;
}

export async function searchDealByName(dealName: string): Promise<HubSpotDeal | null> {
  if (!dealName) return null;

  const result = await hubspotRequest<HubSpotSearchResult<HubSpotDeal>>(
    '/crm/v3/objects/deals/search',
    'POST',
    {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'dealname',
              operator: 'CONTAINS_TOKEN',
              value: dealName,
            },
          ],
        },
      ],
      properties: ['dealname', 'dealstage', 'amount', 'closedate'],
    }
  );

  return result.results[0] || null;
}

const STAGE_MAPPING: Record<string, string> = {
  discovery: 'appointmentscheduled',
  qualification: 'qualifiedtobuy',
  proposal: 'presentationscheduled',
  negotiation: 'decisionmakerboughtin',
  closed_won: 'closedwon',
  closed_lost: 'closedlost',
};

export async function createDeal(
  data: ExtractedData['deal'],
  contactId?: string
): Promise<HubSpotDeal> {
  const properties: Record<string, string | number> = {};

  if (data.name) properties.dealname = data.name;
  if (data.stage && STAGE_MAPPING[data.stage]) {
    properties.dealstage = STAGE_MAPPING[data.stage];
  }
  if (data.amount) properties.amount = data.amount;
  if (data.closeDate) properties.closedate = data.closeDate;

  const result = await hubspotRequest<HubSpotDeal>(
    '/crm/v3/objects/deals',
    'POST',
    { properties }
  );

  // Associate with contact if provided
  if (contactId) {
    await hubspotRequest(
      `/crm/v3/objects/deals/${result.id}/associations/contacts/${contactId}/deal_to_contact`,
      'PATCH'
    ).catch(err => {
      logger.warn('Failed to associate deal with contact', { error: err.message });
    });
  }

  logger.info('Created HubSpot deal', { id: result.id });
  return result;
}

export async function addNoteToContact(
  contactId: string,
  noteBody: string
): Promise<void> {
  const timestamp = Date.now();

  // Create a note engagement
  await hubspotRequest(
    '/crm/v3/objects/notes',
    'POST',
    {
      properties: {
        hs_timestamp: timestamp,
        hs_note_body: noteBody,
      },
      associations: [
        {
          to: { id: contactId },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 202, // Note to Contact
            },
          ],
        },
      ],
    }
  );

  logger.info('Added note to contact', { contactId });
}

export async function addNoteToDeal(
  dealId: string,
  noteBody: string
): Promise<void> {
  const timestamp = Date.now();

  await hubspotRequest(
    '/crm/v3/objects/notes',
    'POST',
    {
      properties: {
        hs_timestamp: timestamp,
        hs_note_body: noteBody,
      },
      associations: [
        {
          to: { id: dealId },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 214, // Note to Deal
            },
          ],
        },
      ],
    }
  );

  logger.info('Added note to deal', { dealId });
}

export function buildNoteFromExtraction(extracted: ExtractedData): string {
  const parts: string[] = [];

  // Header
  parts.push(`📞 <b>Call Summary (${extracted.meetingDate || 'Unknown date'})</b><br>`);

  if (extracted.meetingTitle) {
    parts.push(`<b>Meeting:</b> ${extracted.meetingTitle}<br>`);
  }

  parts.push('<br>');

  // Summary
  parts.push(`${extracted.callSummary}<br>`);

  // Action Items
  if (extracted.actionItems.length > 0) {
    parts.push('<br>');
    parts.push('📋 <b>Action Items:</b><br>');
    extracted.actionItems.forEach(item => parts.push(`• ${item}<br>`));
  }

  // Next Steps
  if (extracted.nextSteps.length > 0) {
    parts.push('<br>');
    parts.push('➡️ <b>Next Steps:</b><br>');
    extracted.nextSteps.forEach(step => parts.push(`• ${step}<br>`));
  }

  // Sentiment
  parts.push('<br>');
  parts.push(`<b>Sentiment:</b> ${extracted.sentiment}`);

  // Deal Notes
  if (extracted.deal?.notes) {
    parts.push('<br><br>');
    parts.push(`<b>Deal Notes:</b> ${extracted.deal.notes}`);
  }

  return parts.join('');
}

export function getContactUrl(contactId: string): string {
  return `https://app.hubspot.com/contacts/8634406/contact/${contactId}`;
}

export function getDealUrl(dealId: string): string {
  return `https://app.hubspot.com/contacts/8634406/deal/${dealId}`;
}
