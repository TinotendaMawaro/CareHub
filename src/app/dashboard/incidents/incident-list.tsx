import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { IncidentReport } from "@/lib/types";
import { useClients } from "@/hooks/use-clients";
import { useCaregivers } from "@/hooks/use-caregivers";
import { format } from "date-fns";

interface IncidentListProps {
  incidents: IncidentReport[];
  onStatusChange: (incidentId: string, newStatus: string) => Promise<void>;
}

export default function IncidentList({ incidents, onStatusChange }: IncidentListProps) {
  const { clients } = useClients();
  const { caregivers } = useCaregivers();
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

  const getStatusBadge = (status: IncidentReport["status"]) => {
    switch (status) {
      case "Resolved":
        return <Badge variant="default" className="bg-green-500 hover:bg-green-600">{status}</Badge>;
      case "Unresolved":
        return <Badge variant="destructive">{status}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleStatusChange = async (incidentId: string, newStatus: IncidentReport["status"]) => {
    await onStatusChange(incidentId, newStatus);
  };

  const getClientName = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    return client?.fullName || 'Unknown Client';
  };

  const getCaregiverName = (caregiverId: string) => {
    const caregiver = caregivers.find(c => c.id === caregiverId);
    return caregiver?.name || 'Unknown Caregiver';
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
              <div className="flex gap-2">
                {getSeverityBadge(incident.severity)}
                {getStatusBadge(incident.status)}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">{incident.description}</p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              <Select
                value={incident.status}
                onValueChange={(value: IncidentReport["status"]) =>
                  handleStatusChange(incident.id, value)
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Resolved">Resolved</SelectItem>
                  <SelectItem value="Unresolved">Unresolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
