"use client";

import { useState } from "react";
import { PlusCircle, MoreHorizontal } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import SchedulingTable from "./scheduling-table";
import ShiftModal from "@/components/shifts/shift-modal";
import { useShifts } from "@/hooks/use-shifts";
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import type { Shift } from "@/lib/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: {
    'en-US': enUS,
  },
});

export default function SchedulingPage() {
  const { shifts, deleteShift, updateShift, loading } = useShifts();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | undefined>();
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [shiftToDelete, setShiftToDelete] = useState<Shift | null>(null);


  const upcomingShifts = shifts.filter(s => s.status === 'Pending' || s.status === 'Accepted' || s.status === 'In Progress');
  const completedShifts = shifts.filter(s => s.status === 'Completed');
  const allShifts = shifts;

  const handleAddShift = () => {
    setEditingShift(undefined);
    setIsModalOpen(true);
  };

  const handleEditShift = (shift: Shift) => {
    setEditingShift(shift);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingShift(undefined);
  };

  const handleDeleteShift = (shift: Shift) => {
    setShiftToDelete(shift);
    setIsDeleteAlertOpen(true);
  };

  const handleStartShift = async (shift: Shift) => {
    await updateShift(shift.id, { status: 'In Progress' });
  };

  const confirmDelete = async () => {
    if (shiftToDelete) {
      await deleteShift(shiftToDelete.id);
      setIsDeleteAlertOpen(false);
      setShiftToDelete(null);
    }
  };

  const calendarEvents = shifts.map(shift => ({
    id: shift.id,
    title: `${shift.clientName} - ${shift.caregiverName}`,
    start: new Date(`${shift.date}T${shift.startTime}`),
    end: new Date(`${shift.date}T${shift.endTime}`),
    resource: shift,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading shifts...</div>
      </div>
    );
  }

  return (
    <>
      <Tabs defaultValue="list">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div>
              <h1 className="text-2xl sm:text-3xl font-bold font-headline">Shift Scheduling</h1>
              <p className="text-muted-foreground">Assign and manage shifts for clients and caregivers.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
              <TabsList className="grid w-full sm:w-auto grid-cols-2 sm:flex">
                  <TabsTrigger value="list">List View</TabsTrigger>
                  <TabsTrigger value="calendar">Calendar View</TabsTrigger>
              </TabsList>
              <Button onClick={handleAddShift} className="w-full sm:w-auto">
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Shift
              </Button>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <TabsContent value="list">
              <Tabs defaultValue="clients">
                <TabsList className="mb-4 grid w-full grid-cols-3">
                  <TabsTrigger value="clients">Clients</TabsTrigger>
                  <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                  <TabsTrigger value="completed">Completed</TabsTrigger>
                </TabsList>
                <TabsContent value="clients">
                  <div className="space-y-4">
                    {Object.entries(shifts.reduce((acc: { [key: string]: Shift[] }, shift) => {
                      const clientName = shift.clientName || 'Unknown Client';
                      if (!acc[clientName]) acc[clientName] = [];
                      acc[clientName].push(shift);
                      return acc;
                    }, {})).map(([clientName, clientShifts]) => (
                      <Card key={clientName} className="p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold">{clientName}</h3>
                          <Badge variant="outline">{clientShifts.length} shifts</Badge>
                        </div>
                        <div className="space-y-2">
                          {clientShifts.map((shift) => (
                            <div key={shift.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                              <div className="flex-1">
                                <div className="font-medium">{shift.caregiverName || 'Unknown Caregiver'}</div>
                                <div className="text-sm text-muted-foreground">
                                  {format(new Date(shift.date), 'MMM d, yyyy')} • {shift.startTime} - {shift.endTime}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {(() => {
                                  switch (shift.status) {
                                    case 'Pending':
                                      return <Badge variant="outline">Pending</Badge>;
                                    case 'Accepted':
                                      return <Badge>Accepted</Badge>;
                                    case 'In Progress':
                                      return <Badge variant="default">In Progress</Badge>;
                                    case 'Completed':
                                      return <Badge variant="secondary">Completed</Badge>;
                                    default:
                                      return <Badge variant="secondary">{shift.status}</Badge>;
                                  }
                                })()}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button aria-haspopup="true" size="icon" variant="ghost">
                                      <MoreHorizontal className="h-4 w-4" />
                                      <span className="sr-only">Toggle menu</span>
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                    {(shift.status === 'Pending' || shift.status === 'Accepted') && (
                                      <DropdownMenuItem onClick={() => handleStartShift(shift)}>Start Shift</DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => handleEditShift(shift)}>Edit Shift</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleDeleteShift(shift)} className="text-destructive">
                                      Delete Shift
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="upcoming">
                  <SchedulingTable shifts={upcomingShifts} onEdit={handleEditShift} onDelete={handleDeleteShift} onStart={handleStartShift} />
                </TabsContent>
                <TabsContent value="completed">
                  <SchedulingTable shifts={completedShifts} onEdit={handleEditShift} onDelete={handleDeleteShift} onStart={handleStartShift} />
                </TabsContent>
              </Tabs>
            </TabsContent>
            <TabsContent value="calendar">
              <div style={{ height: '600px' }}>
                <Calendar
                  localizer={localizer}
                  events={calendarEvents}
                  startAccessor="start"
                  endAccessor="end"
                  style={{ height: '100%' }}
                  onSelectEvent={(event: any) => handleEditShift(event.resource)}
                />
              </div>
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
      <ShiftModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        shift={editingShift}
      />
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the shift.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
