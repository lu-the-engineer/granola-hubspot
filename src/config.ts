import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Load .env and manually assign to process.env (workaround for Node 22 issue)
const result = dotenvConfig();
if (result.parsed) {
  Object.assign(process.env, result.parsed);
}

const envSchema = z.object({
  PORT: z.string().default('3000').transform(Number),
  PASSWORD: z.string().min(1, 'PASSWORD is required'),
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  HUBSPOT_ACCESS_TOKEN: z.string().min(1, 'HUBSPOT_ACCESS_TOKEN is required'),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Environment validation failed:');
    for (const error of result.error.errors) {
      console.error(`  - ${error.path.join('.')}: ${error.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
