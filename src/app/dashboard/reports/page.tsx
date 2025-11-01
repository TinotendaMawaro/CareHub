import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import CaregiverHoursChart from "./caregiver-hours-chart";
import IncidentSummary from "./incident-summary";
import { incidentReports } from "@/lib/data";

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-headline">Reports & Analytics</h1>
          <p className="text-muted-foreground">
            Insights into caregiver performance and client care.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Caregiver Hours</CardTitle>
              <CardDescription>
                Weekly logged hours per caregiver.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CaregiverHoursChart />
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-2">
            <IncidentSummary reports={incidentReports} />
        </div>
      </div>
    </div>
  );
}
