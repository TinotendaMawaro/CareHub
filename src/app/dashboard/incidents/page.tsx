"use client";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import IncidentForm from "./incident-form";
import IncidentList from "./incident-list";
import { useIncidents } from "@/hooks/use-incidents";
import { useClients } from "@/hooks/use-clients";

export default function IncidentsPage() {
  const { incidents, loading: incidentsLoading, addIncident, updateIncident } = useIncidents();
  const { clients, loading: clientsLoading } = useClients();

  const handleStatusChange = async (incidentId: string, newStatus: string) => {
    await updateIncident(incidentId, { status: newStatus as any });
  };

  if (incidentsLoading || clientsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading incidents...</div>
      </div>
    );
  }

  return (
    <Tabs defaultValue="report">
      <div className="flex items-center justify-between mb-6">
        <div>
            <h1 className="text-3xl font-bold font-headline">Incident Reporting</h1>
            <p className="text-muted-foreground">Log new incidents and review past reports.</p>
        </div>
        <TabsList>
            <TabsTrigger value="report">Report an Incident</TabsTrigger>
            <TabsTrigger value="history">View Incident Reports</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="report">
        <IncidentForm clients={clients} onSubmit={addIncident} />
      </TabsContent>
      <TabsContent value="history">
        <Card>
            <CardContent className="pt-6">
              <IncidentList incidents={incidents} onStatusChange={handleStatusChange} />
            </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
