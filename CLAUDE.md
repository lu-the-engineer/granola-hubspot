# Granola Assistant

AI-powered tool that processes Granola meeting transcripts, syncs extracted data to HubSpot, and creates follow-up tasks.

## Project Overview

This is a local web app for Fourthwall's sales team. After every Granola call, the transcript can be:
1. Sent automatically via Zapier webhook
2. Manually uploaded through the web UI

The app uses Claude AI to extract structured data (contacts, deals, action items) and syncs it to HubSpot.

## Tech Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Backend**: Express.js
- **Frontend**: Vanilla HTML/CSS/JS
- **AI**: Claude API (Anthropic SDK) - claude-sonnet-4-20250514
- **Auth**: Simple shared password
- **Integrations**: HubSpot REST API

## Development

### Getting Started

```bash
# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env
# Edit .env with your API keys

# Run in development mode
npm run dev

# Build for production
npm run build
npm start
```

### Environment Variables

- `PORT` - Server port (default: 3000)
- `PASSWORD` - Shared password for authentication
- `ANTHROPIC_API_KEY` - Claude API key
- `HUBSPOT_ACCESS_TOKEN` - HubSpot private app token

### Project Structure

```
src/
├── index.ts              # Express server entry point
├── config.ts             # Environment configuration
├── middleware/
│   └── auth.ts           # Password authentication
├── routes/
│   ├── health.ts         # GET /health
│   ├── webhook.ts        # POST /webhook (Zapier)
│   └── upload.ts         # POST /api/upload (manual)
├── services/
│   ├── claude.ts         # AI extraction
│   ├── hubspot.ts        # HubSpot API operations
│   └── processor.ts      # Main processing pipeline
├── types/
│   └── index.ts          # TypeScript interfaces
└── utils/
    └── logger.ts         # Logging utility

public/
├── index.html            # Upload UI
├── style.css             # Styling
└── app.js                # Frontend logic
```

### API Endpoints

- `GET /health` - Health check (no auth required)
- `POST /webhook` - Zapier webhook (requires `X-Webhook-Token` header)
- `POST /api/upload` - Manual upload (requires `X-Password` header)

### Zapier Integration

Configure a Zap with:
1. **Trigger**: Granola - New Note Added to Folder
2. **Action**: Webhooks by Zapier - POST to `http://your-server:3000/webhook`
3. **Headers**: `X-Webhook-Token: your-password`
4. **Body**: `{ "transcript": "...", "title": "...", "date": "..." }`

## Guidelines for Claude

- Use TypeScript strict mode
- Keep services focused and single-purpose
- Log important operations for debugging
- Handle errors gracefully with informative messages
- Don't store sensitive data; process and forward to HubSpot

## HubSpot Integration

The app connects to Fourthwall's HubSpot account (ID: 8634406):
- Creates/updates **Contacts** with extracted info
- Creates/finds **Deals** with deal signals
- Adds **Notes** with call summary, action items, next steps

## Notes

- Project created: January 2026
- Status: MVP complete
- Future: Add Jira and Trello integrations
