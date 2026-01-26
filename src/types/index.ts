export interface ExtractedContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
}

export interface ExtractedDeal {
  name?: string;
  stage?: 'discovery' | 'qualification' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
  amount?: number;
  closeDate?: string;
  notes?: string;
}

export interface ExtractedData {
  contacts: ExtractedContact[];  // Changed to array for multiple contacts
  deal: ExtractedDeal;
  callSummary: string;
  actionItems: string[];
  nextSteps: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  meetingDate?: string;
  meetingTitle?: string;
  // Specialized extraction for follow-up tasks
  manufacturing?: {
    products: string[];           // Products discussed (merch types, items)
    quantities?: string;          // Volume/quantity discussed
    materials?: string[];         // Materials, fabrics, packaging mentioned
    timeline?: string;            // Production timeline discussed
    requirements?: string[];      // Special requirements, customizations
    concerns?: string[];          // Manufacturing concerns or questions
  };
  creativeInfo?: {
    themes?: string[];            // Visual themes, aesthetics, style directions
    inspiration?: string[];       // Inspiration sources, references, mood
    colors?: string[];            // Color preferences mentioned
    brandElements?: string[];     // Logo, brand assets, existing designs
    socialLinks?: string[];       // Social media URLs, handles mentioned
    websiteLinks?: string[];      // Website URLs mentioned
  };
}

export interface TranscriptPayload {
  transcript: string;
  title?: string;
  date?: string;
  attendees?: string[];  // Now expects emails
  creatorName?: string;  // Creator/brand name for social lookup
}

export interface SocialProfile {
  platform: string;
  url: string;
}

export interface HubSpotContact {
  id: string;
  properties: {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    company?: string;
    jobtitle?: string;
    [key: string]: string | undefined;
  };
}

export interface HubSpotDeal {
  id: string;
  properties: {
    dealname?: string;
    dealstage?: string;
    amount?: string;
    closedate?: string;
    [key: string]: string | undefined;
  };
}

export interface HubSpotContactResult {
  id: string;
  action: 'created' | 'updated' | 'found';
  url: string;
  email?: string;
  name?: string;
}

export interface ProcessingResult {
  success: boolean;
  extracted: ExtractedData;
  hubspot: {
    contacts: HubSpotContactResult[];  // Changed to array
    deal?: {
      id: string;
      action: 'created' | 'updated' | 'found';
      url: string;
    };
    noteAdded: boolean;
  };
  errors?: string[];
}
