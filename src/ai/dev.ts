import { config } from 'dotenv';
config();

import '@/ai/flows/summarize-incident-reports.ts';
import '@/ai/flows/suggest-caregiver-skills.ts';
import '@/ai/flows/generate-client-report.ts';