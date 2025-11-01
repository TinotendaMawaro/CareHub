import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ClientTable from "./client-table";
import { clients } from "@/lib/data";

export default function ClientsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
            <h1 className="text-3xl font-bold font-headline">Clients</h1>
            <p className="text-muted-foreground">Manage your client profiles and care needs.</p>
        </div>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Client
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Client List</CardTitle>
          <CardDescription>
            A list of all clients in the CareHub system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientTable clients={clients} />
        </CardContent>
      </Card>
    </div>
  );
}
