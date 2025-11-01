import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import CaregiverTable from "./caregiver-table";
import { caregivers } from "@/lib/data";

export default function CaregiversPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
         <div>
            <h1 className="text-3xl font-bold font-headline">Caregivers</h1>
            <p className="text-muted-foreground">Manage your caregiver profiles and availability.</p>
        </div>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Caregiver
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Caregiver List</CardTitle>
          <CardDescription>
            A list of all caregivers in the CareHub system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CaregiverTable caregivers={caregivers} />
        </CardContent>
      </Card>
    </div>
  );
}
