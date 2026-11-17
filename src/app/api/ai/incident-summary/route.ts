import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/supabase/server';
import { summarizeIncidentReports } from '@/ai/flows/summarize-incident-reports';

/**
 * POST /api/ai/incident-summary
 * Office staff only, and only when they ask for it. Sends the most recent incident descriptions to the
 * model WITHOUT participant or worker names or any other identifier, and returns a short trend summary.
 */
export async function POST(request: NextRequest) {
  const ctx = await getRequestContext(request);
  if (!ctx || !['admin', 'manager', 'office'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    return NextResponse.json({ error: 'AI summaries are not configured (no GEMINI_API_KEY).' }, { status: 503 });
  }

  const { data, error } = await ctx.db
    .from('incidents')
    .select('date, incident_type, severity, description, actions_taken')
    .order('date', { ascending: false })
    .limit(40);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ summary: 'There are no incident reports to summarise yet.' });

  const text = data
    .map((r) => `Date: ${r.date}; Type: ${r.incident_type}; Severity: ${r.severity ?? 'unrated'}; What happened: ${r.description}; Action: ${r.actions_taken ?? 'none recorded'}`)
    .join('\n---\n');

  try {
    const out = await summarizeIncidentReports({ incidentReports: text });
    return NextResponse.json({ summary: out.summary });
  } catch (e) {
    console.error('incident summary failed', e);
    return NextResponse.json({ error: 'The AI service could not produce a summary right now. Try again later.' }, { status: 502 });
  }
}
