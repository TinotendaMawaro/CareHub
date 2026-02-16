"use client";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import IncidentList from "./incident-list";
import IncidentForm from "./incident-form";
import { useIncidents } from "@/hooks/use-incidents";
import { useClients } from "@/hooks/use-clients";

export default function IncidentsPage() {
  const { incidents, loading: incidentsLoading, updateIncident, addIncident } = useIncidents();
  const { clients } = useClients();

  const handleStatusChange = async (incidentId: string, newStatus: string) => {
    await updateIncident(incidentId, { status: newStatus as any });
  };

  const handleAddIncident = async (data: any) => {
    await addIncident(data);
  };

  if (incidentsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading incidents...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Incident Reports</h1>
        <p className="text-muted-foreground">Review and manage incident reports submitted by caregivers.</p>
      </div>
      <IncidentForm clients={clients} onSubmit={handleAddIncident} />
      <Card>
        <CardContent className="pt-6">
          <IncidentList incidents={incidents} onStatusChange={handleStatusChange} />
        </CardContent>
      </Card>
    </div>
  );
}
