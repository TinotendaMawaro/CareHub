import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import IncidentForm from "./incident-form";
import IncidentList from "./incident-list";
import { incidentReports, clients } from "@/lib/data";

export default function IncidentsPage() {
  return (
    <Tabs defaultValue="report">
      <div className="flex items-center justify-between mb-6">
        <div>
            <h1 className="text-3xl font-bold font-headline">Incident Reporting</h1>
            <p className="text-muted-foreground">Log new incidents and review past reports.</p>
        </div>
        <TabsList>
            <TabsTrigger value="report">Report an Incident</TabsTrigger>
            <TabsTrigger value="history">View History</TabsTrigger>
        </TabsList>
      </div>
      
      <TabsContent value="report">
        <IncidentForm clients={clients} />
      </TabsContent>
      <TabsContent value="history">
        <Card>
            <CardContent className="pt-6">
              <IncidentList incidents={incidentReports} />
            </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
