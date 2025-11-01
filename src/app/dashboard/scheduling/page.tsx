import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SchedulingTable from "./scheduling-table";
import { shifts } from "@/lib/data";

export default function SchedulingPage() {
  const upcomingShifts = shifts.filter(s => s.status === 'Upcoming' || s.status === 'In Progress');
  const completedShifts = shifts.filter(s => s.status === 'Completed');
  const allShifts = shifts;

  return (
    <Tabs defaultValue="upcoming">
      <div className="flex items-center justify-between mb-6">
        <div>
            <h1 className="text-3xl font-bold font-headline">Shift Scheduling</h1>
            <p className="text-muted-foreground">Assign and manage shifts for clients and caregivers.</p>
        </div>
        <div className="flex items-center gap-4">
            <TabsList>
                <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="all">All Shifts</TabsTrigger>
            </TabsList>
            <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Shift
            </Button>
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          <TabsContent value="upcoming">
            <SchedulingTable shifts={upcomingShifts} />
          </TabsContent>
          <TabsContent value="completed">
            <SchedulingTable shifts={completedShifts} />
          </TabsContent>
          <TabsContent value="all">
            <SchedulingTable shifts={allShifts} />
          </TabsContent>
        </CardContent>
      </Card>
    </Tabs>
  );
}
