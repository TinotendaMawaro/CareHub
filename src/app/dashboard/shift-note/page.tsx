"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
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
    const q = query(collection(db, 'shiftNotes'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notes: ShiftNote[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date(),
      })) as ShiftNote[];
      setShiftNotes(notes);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleStatusUpdate = async (noteId: string, newStatus: ShiftNote['status']) => {
    try {
      await updateDoc(doc(db, 'shiftNotes', noteId), { status: newStatus });
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-headline">Shift Notes</h1>
          <p className="text-muted-foreground">Manage shift notes from caregivers.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Shift Notes List</CardTitle>
          <CardDescription>
            Review and update the status of shift notes submitted by caregivers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">Loading shift notes...</div>
          ) : shiftNotes.length === 0 ? (
            <div className="text-center py-4">No shift notes found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caregiver</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shiftNotes.map((note) => (
                  <TableRow key={note.id}>
                    <TableCell>{getCaregiverName(note.caregiverId)}</TableCell>
                    <TableCell>{getClientName(note.clientId)}</TableCell>
                    <TableCell className="max-w-xs truncate">{note.note}</TableCell>
                    <TableCell>{note.timestamp.toLocaleString()}</TableCell>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
