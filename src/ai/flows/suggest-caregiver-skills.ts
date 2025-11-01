'use server';

/**
 * @fileOverview Suggests caregivers based on a client's needs and caregiver skills.
 *
 * - suggestCaregiverSkills - A function that suggests caregivers based on client needs.
 * - SuggestCaregiverSkillsInput - The input type for the suggestCaregiverSkills function.
 * - SuggestCaregiverSkillsOutput - The output type for the suggestCaregiverSkills function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestCaregiverSkillsInputSchema = z.object({
  clientNeeds: z
    .string()
    .describe('A description of the client and their specific needs.'),
  caregiverProfiles: z
    .string()
    .describe(
      'A list of caregiver profiles with their skills and experience.'
    ),
});

export type SuggestCaregiverSkillsInput = z.infer<
  typeof SuggestCaregiverSkillsInputSchema
>;

const SuggestCaregiverSkillsOutputSchema = z.object({
  suggestedCaregivers: z
    .string()
    .describe(
      'A list of suggested caregivers ranked by suitability for the client needs.'
    ),
});

export type SuggestCaregiverSkillsOutput = z.infer<
  typeof SuggestCaregiverSkillsOutputSchema
>;

export async function suggestCaregiverSkills(
  input: SuggestCaregiverSkillsInput
): Promise<SuggestCaregiverSkillsOutput> {
  return suggestCaregiverSkillsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestCaregiverSkillsPrompt',
  input: {schema: SuggestCaregiverSkillsInputSchema},
  output: {schema: SuggestCaregiverSkillsOutputSchema},
  prompt: `You are an expert in matching caregivers to clients based on their needs.

  Given the following client needs: {{{clientNeeds}}}
  And the following caregiver profiles: {{{caregiverProfiles}}}

  Suggest a ranked list of caregivers best suited to the client's needs, with a brief explanation of why they are a good fit.
  Ensure the output is a JSON format.
  `,
});

const suggestCaregiverSkillsFlow = ai.defineFlow(
  {
    name: 'suggestCaregiverSkillsFlow',
    inputSchema: SuggestCaregiverSkillsInputSchema,
    outputSchema: SuggestCaregiverSkillsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
