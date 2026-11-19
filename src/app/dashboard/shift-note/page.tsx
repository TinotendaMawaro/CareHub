"use client";

import { useState, useEffect } from "react";
import { Pager, usePaged } from "@/components/ui/pager";
import { supabase } from "@/lib/supabase/client";
import { refreshOnChange } from "@/lib/supabase/realtime";
import { mapShiftNote } from "@/lib/supabase/mappers";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useCaregivers } from "@/hooks/use-caregivers";
import { useClients } from "@/hooks/use-clients";
import type { ShiftNote } from "@/lib/types";

export default function ShiftNotesPage() {
  const [shiftNotes, setShiftNotes] = useState<ShiftNote[]>([]);
  const [loading, setLoading] = useState(true);
  const { caregivers } = useCaregivers();
  const { clients } = useClients();

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("shift_notes")
        .select("*")
        .order("timestamp", { ascending: false });
      if (error) throw error;
      setShiftNotes((data ?? []).map(mapShiftNote));
    };

    void load()
      .catch((error) => console.error("Error fetching shift notes:", error))
      .finally(() => setLoading(false));

    return refreshOnChange("shift_notes", load);
  }, []);

  const handleStatusUpdate = async (noteId: string, newStatus: ShiftNote['status']) => {
    try {
      const { error } = await supabase
        .from("shift_notes")
        .update({ status: newStatus })
        .eq("id", noteId);
      if (error) throw error;
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const getCaregiverName = (id: string) => {
    const caregiver = caregivers.find(c => c.id === id);
    return caregiver ? caregiver.name : 'Unknown';
  };

  const getClientName = (id: string) => {
    const client = clients.find(c => c.id === id);
    return client ? client.fullName : 'Unknown';
  };

  const getStatusBadge = (status: ShiftNote['status']) => {
    const variants = {
      'Open': 'default',
      'Resolved': 'secondary',
      'Closed': 'outline',
      'Unresolved': 'destructive',
    } as const;
    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  const paged = usePaged(shiftNotes, 20, shiftNotes.length);
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-headline">Shift Notes</h1>
          <p className="text-muted-foreground">Manage shift notes from staff.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Shift Notes List</CardTitle>
          <CardDescription>
            Review and update the status of shift notes submitted by staff.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">Loading shift notes...</div>
          ) : shiftNotes.length === 0 ? (
            <div className="text-center py-4">No shift notes found.</div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.rows.map((note) => (
                  <TableRow key={note.id}>
                    <TableCell>{getCaregiverName(note.caregiverId)}</TableCell>
                    <TableCell>{getClientName(note.clientId)}</TableCell>
                    <TableCell className="max-w-xs truncate">{note.note}</TableCell>
                    <TableCell className="whitespace-nowrap">{note.timestamp.toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</TableCell>
                    <TableCell>{getStatusBadge(note.status)}</TableCell>
                    <TableCell>
                      <Select
                        value={note.status}
                        onValueChange={(value: ShiftNote['status']) => handleStatusUpdate(note.id, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Open">Open</SelectItem>
                          <SelectItem value="Resolved">Resolved</SelectItem>
                          <SelectItem value="Closed">Closed</SelectItem>
                          <SelectItem value="Unresolved">Unresolved</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager {...paged.pager} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
