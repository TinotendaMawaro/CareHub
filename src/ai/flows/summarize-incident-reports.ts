'use server';

/**
 * @fileOverview Summarizes incident reports to identify key trends and recurring issues.
 *
 * - summarizeIncidentReports - A function that summarizes incident reports.
 * - SummarizeIncidentReportsInput - The input type for the summarizeIncidentReports function.
 * - SummarizeIncidentReportsOutput - The return type for the summarizeIncidentReports function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeIncidentReportsInputSchema = z.object({
  incidentReports: z.string().describe('A list of incident reports to summarize.'),
});
export type SummarizeIncidentReportsInput = z.infer<typeof SummarizeIncidentReportsInputSchema>;

const SummarizeIncidentReportsOutputSchema = z.object({
  summary: z.string().describe('A summary of the incident reports, highlighting key trends and recurring issues.'),
});
export type SummarizeIncidentReportsOutput = z.infer<typeof SummarizeIncidentReportsOutputSchema>;

export async function summarizeIncidentReports(input: SummarizeIncidentReportsInput): Promise<SummarizeIncidentReportsOutput> {
  return summarizeIncidentReportsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeIncidentReportsPrompt',
  input: {schema: SummarizeIncidentReportsInputSchema},
  output: {schema: SummarizeIncidentReportsOutputSchema},
  prompt: `You are an administrator for a care facility. You will be provided a series of incident reports.  Your job is to summarize the incident reports, highlighting key trends and recurring issues, so that you can proactively address potential safety concerns and improve the quality of care.  Here are the incident reports: {{{incidentReports}}}`,
});

const summarizeIncidentReportsFlow = ai.defineFlow(
  {
    name: 'summarizeIncidentReportsFlow',
    inputSchema: SummarizeIncidentReportsInputSchema,
    outputSchema: SummarizeIncidentReportsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
