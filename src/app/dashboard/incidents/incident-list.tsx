import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { IncidentReport } from "@/lib/types";
import { getClientName, getCaregiverName } from "@/lib/data";
import { format } from "date-fns";

export default function IncidentList({
  incidents,
}: {
  incidents: IncidentReport[];
}) {
  const getSeverityBadge = (severity: IncidentReport["severity"]) => {
    switch (severity) {
      case "Low":
        return <Badge variant="secondary">{severity}</Badge>;
      case "Medium":
        return <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600">{severity}</Badge>;
      case "High":
        return <Badge variant="destructive">{severity}</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  return (
    <div className="grid gap-4">
      {incidents.map((incident) => (
        <Card key={incident.id} className="shadow-sm">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>
                  Incident involving {getClientName(incident.clientId)}
                </CardTitle>
                <CardDescription>
                  Reported by {getCaregiverName(incident.caregiverId)} on{" "}
                  {format(new Date(incident.date), "MMMM d, yyyy")} at {incident.time}
                </CardDescription>
              </div>
              {getSeverityBadge(incident.severity)}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{incident.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
