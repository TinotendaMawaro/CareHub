import { summarizeIncidentReports } from "@/ai/flows/summarize-incident-reports";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Bot } from "lucide-react";
import type { IncidentReport } from "@/lib/types";

export default async function IncidentSummary({ reports }: { reports: IncidentReport[] }) {
  const reportTexts = reports.map(
    (r) => `Date: ${r.date}, Severity: ${r.severity}, Description: ${r.description}`
  ).join("\n---\n");

  const summaryResult = await summarizeIncidentReports({
    incidentReports: reportTexts,
  });

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI-Powered Incident Summary
        </CardTitle>
        <CardDescription>
          Key trends and recurring issues from recent incident reports.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="prose prose-sm dark:prose-invert text-sm text-foreground bg-muted/50 rounded-lg p-4">
          {summaryResult.summary.split('\n').map((line, index) => {
            if (line.startsWith('*') || line.startsWith('-')) {
              return <p key={index} className="m-0 ml-4 before:content-['•'] before:mr-2">{line.substring(1).trim()}</p>
            }
            return <p key={index} className="m-0">{line}</p>
          })}
        </div>
      </CardContent>
    </Card>
  );
}
