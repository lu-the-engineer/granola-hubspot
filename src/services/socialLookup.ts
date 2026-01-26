import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export interface SocialProfile {
  platform: string;
  url: string;
}

export interface SocialLookupResult {
  creatorName: string;
  profiles: SocialProfile[];
  searchedAt: string;
}

const anthropic = new Anthropic({
  apiKey: config.ANTHROPIC_API_KEY,
});

const PLATFORMS_TO_SEARCH = [
  'YouTube',
  'Instagram',
  'TikTok',
  'Twitter/X',
  'LinkedIn',
  'Patreon',
  'Ko-fi',
  'Kick',
  'Website',
];

// Use Claude with web search to find real social profiles
export async function lookupCreatorSocials(creatorName: string): Promise<SocialLookupResult> {
  logger.info('Looking up social profiles with web search', { creatorName });

  const searchPrompt = `Find the official social media profiles and website for "${creatorName}" (content creator/brand).

Search for their presence on these platforms: ${PLATFORMS_TO_SEARCH.join(', ')}

IMPORTANT:
- Only include profiles that you can verify actually exist and belong to this creator
- Do NOT guess or make up URLs - only return real, verified profile URLs
- If you can't find a profile on a platform, don't include it
- For YouTube, find their actual channel URL (youtube.com/@username or youtube.com/c/channelname)
- For Instagram, find their actual profile (instagram.com/username)
- For TikTok, find their actual profile (tiktok.com/@username)
- For Twitter/X, find their actual profile (twitter.com/username or x.com/username)
- For their website, find their official website domain

Return ONLY a JSON array of found profiles in this exact format:
[
  {"platform": "YouTube", "url": "https://www.youtube.com/@actualusername"},
  {"platform": "Instagram", "url": "https://www.instagram.com/actualusername"}
]

If you cannot find any verified profiles, return an empty array: []

Return ONLY the JSON array, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: searchPrompt,
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

    const profiles = JSON.parse(jsonStr) as SocialProfile[];

    // Filter to only valid profiles with URLs
    const validProfiles = profiles.filter(p =>
      p.platform &&
      p.url &&
      p.url.startsWith('http')
    );

    logger.info('Social lookup complete', {
      creatorName,
      profileCount: validProfiles.length,
      platforms: validProfiles.map(p => p.platform),
    });

    return {
      creatorName,
      profiles: validProfiles,
      searchedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Social lookup failed', { error: message, creatorName });

    // Return empty result on error
    return {
      creatorName,
      profiles: [],
      searchedAt: new Date().toISOString(),
    };
  }
}

// Build profile URLs for display/export
export function buildSocialLinksHtml(profiles: SocialProfile[]): string {
  return profiles
    .map(p => `<a href="${p.url}" target="_blank">${p.platform}</a>`)
    .join(' | ');
}

export function buildSocialLinksText(profiles: SocialProfile[]): string {
  return profiles
    .map(p => `${p.platform}: ${p.url}`)
    .join('\n');
}
