'use server';

/**
 * @fileOverview Flow for generating a report summarizing a client's care history.
 *
 * - generateClientReport - A function that generates the client report.
 * - GenerateClientReportInput - The input type for the generateClientReport function.
 * - GenerateClientReportOutput - The return type for the generateClientReport function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateClientReportInputSchema = z.object({
  clientId: z.string().describe('The ID of the client to generate the report for.'),
});
export type GenerateClientReportInput = z.infer<typeof GenerateClientReportInputSchema>;

const GenerateClientReportOutputSchema = z.object({
  report: z.string().describe('A summary report of the client\'s care history.'),
});
export type GenerateClientReportOutput = z.infer<typeof GenerateClientReportOutputSchema>;

export async function generateClientReport(input: GenerateClientReportInput): Promise<GenerateClientReportOutput> {
  return generateClientReportFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateClientReportPrompt',
  input: {schema: GenerateClientReportInputSchema},
  output: {schema: GenerateClientReportOutputSchema},
  prompt: `You are an AI assistant that generates a report summarizing a client's care history.  The report contains caregiver interactions, shift details, and incident reports.

  Generate a comprehensive report for client with ID: {{{clientId}}}. Include details about caregiver interactions, shift schedules, and any incident reports filed.  The report should provide a clear understanding of the client's overall care experience.
  `,
});

const generateClientReportFlow = ai.defineFlow(
  {
    name: 'generateClientReportFlow',
    inputSchema: GenerateClientReportInputSchema,
    outputSchema: GenerateClientReportOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
