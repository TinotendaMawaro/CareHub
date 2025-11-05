"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, Clock, User, CheckCircle, XCircle, PlayCircle } from "lucide-react";
import type { Client, Shift } from "@/lib/types";
import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Shift } from '@/lib/types';

interface ClientScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
}

export default function ClientScheduleModal({
  isOpen,
  onClose,
  client
}: ClientScheduleModalProps) {
  const [clientShifts, setClientShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!client || !isOpen) return;

    setLoading(true);
    const q = query(
      collection(db, 'shifts'),
      where('clientId', '==', client.id),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const shifts: Shift[] = [];
      querySnapshot.forEach((doc) => {
        shifts.push({ id: doc.id, ...doc.data() } as Shift);
      });
      setClientShifts(shifts);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching shifts:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [client, isOpen]);

  if (!client) return null;

  const getStatusIcon = (status: Shift['status']) => {
    switch (status) {
      case 'Completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'In Progress':
        return <PlayCircle className="h-4 w-4 text-blue-500" />;
      case 'Upcoming':
        return <Clock className="h-4 w-4 text-orange-500" />;
      case 'Cancelled':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: Shift['status']) => {
    switch (status) {
      case 'Completed':
        return <Badge variant="default" className="bg-green-500">Completed</Badge>;
      case 'In Progress':
        return <Badge variant="default" className="bg-blue-500">In Progress</Badge>;
      case 'Upcoming':
        return <Badge variant="default" className="bg-orange-500">Upcoming</Badge>;
      case 'Cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };



  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={client.avatarUrl} alt={client.fullName} />
              <AvatarFallback>{client.fullName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-semibold">{client.fullName}</h2>
              <p className="text-sm text-muted-foreground">Schedule Overview</p>
            </div>
          </DialogTitle>
          <DialogDescription>
            All scheduled shifts and care sessions for {client.fullName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Loading shifts...</p>
            </div>
          ) : clientShifts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No scheduled shifts found for this client.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {clientShifts.map((shift) => (
                <div
                  key={shift.id}
                  className="border rounded-lg p-4 space-y-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(shift.status)}
                      <div>
                        <h3 className="font-medium">{formatDate(shift.date)}</h3>
                        <p className="text-sm text-muted-foreground">
                          {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(shift.status)}
                  </div>

                  <Separator />

                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Caregiver:</span>
                    <span>{shift.caregiverId || 'Unassigned'}</span>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Shift ID: {shift.id}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
