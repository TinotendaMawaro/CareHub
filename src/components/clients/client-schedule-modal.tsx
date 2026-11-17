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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Clock, User, CheckCircle, XCircle, PlayCircle } from "lucide-react";
import type { Client, Shift } from "@/lib/types";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { refreshOnChange } from '@/lib/supabase/realtime';
import { mapShift } from '@/lib/supabase/mappers';
import { useShifts } from "@/hooks/use-shifts";
import { useToast } from "@/hooks/use-toast";

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
  const [filterDate, setFilterDate] = useState<string>("");
  const [showCompletedOnly, setShowCompletedOnly] = useState(false);
  const { caregivers, updateShift, deleteShift } = useShifts();
  const { toast } = useToast();

  useEffect(() => {
    if (!client || !isOpen) return;

    setLoading(true);

    const load = async () => {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('client_id', client.id)
        .order('date', { ascending: false });
      if (error) throw error;
      setClientShifts((data ?? []).map((row) => mapShift(row, [client], caregivers)));
    };

    void load()
      .catch((error) => console.error('Error fetching shifts:', error))
      .finally(() => setLoading(false));

    return refreshOnChange('shifts', load, `client_id=eq.${client.id}`);
  }, [client, isOpen, caregivers]);

  if (!client) return null;

  const getStatusIcon = (status: Shift['status']) => {
    switch (status) {
      case 'Completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'In Progress':
        return <PlayCircle className="h-4 w-4 text-blue-500" />;
      case 'Scheduled':
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
      case 'Scheduled':
        return <Badge variant="default" className="bg-orange-500">Scheduled</Badge>;
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
    if (!timeString || typeof timeString !== 'string') return 'Invalid time';
    const parts = timeString.split(':');
    if (parts.length !== 2) return timeString;
    const [hours, minutes] = parts;
    const hour = parseInt(hours);
    if (isNaN(hour)) return timeString;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Filter shifts based on date and completion status
  const filteredShifts = clientShifts.filter(shift => {
    if (filterDate && new Date(shift.startTime).toDateString() !== new Date(filterDate).toDateString()) return false;
    if (showCompletedOnly && shift.status !== 'Completed') return false;
    return true;
  });

  const handleAssignCaregiver = async (shiftId: string, caregiverId: string) => {
    try {
      await updateShift(shiftId, { caregiverId });
      toast({
        title: "Success",
        description: "Caregiver assigned successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to assign caregiver",
        variant: "destructive",
      });
    }
  };

  const handleDeleteShift = async (shiftId: string) => {
    if (confirm("Are you sure you want to delete this shift?")) {
      try {
        await deleteShift(shiftId);
        toast({
          title: "Success",
          description: "Shift deleted successfully",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete shift",
          variant: "destructive",
        });
      }
    }
  };

  const handleCancelShift = async (shiftId: string) => {
    try {
      await updateShift(shiftId, { status: 'Cancelled' });
      toast({
        title: "Success",
        description: "Shift cancelled successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to cancel shift",
        variant: "destructive",
      });
    }
  };

  const handleApproveShift = async (shiftId: string) => {
    try {
      await updateShift(shiftId, { status: 'Scheduled' });
      toast({
        title: "Success",
        description: "Shift approved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to approve shift",
        variant: "destructive",
      });
    }
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

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1">
            <Label htmlFor="filter-date">Filter by Date</Label>
            <Input
              id="filter-date"
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="show-completed"
              checked={showCompletedOnly}
              onChange={(e) => setShowCompletedOnly(e.target.checked)}
            />
            <Label htmlFor="show-completed">Show completed shifts only</Label>
          </div>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Loading shifts...</p>
            </div>
          ) : filteredShifts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No shifts found matching the current filters.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredShifts.map((shift) => (
                <div
                  key={shift.shiftId}
                  className="border rounded-lg p-4 space-y-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(shift.status)}
                      <div>
                        <h3 className="font-medium">{new Date(shift.startTime).toLocaleDateString()}</h3>
                        <p className="text-sm text-muted-foreground">
                          {new Date(shift.startTime).toLocaleTimeString()} - {new Date(shift.endTime).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(shift.status)}
                  </div>

                  <Separator />

                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Caregiver:</span>
                    <span>{shift.caregiverName || shift.caregiverId || 'Unassigned'}</span>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Shift ID: {shift.shiftId}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2">
                    {(shift.status === 'Scheduled') && (
                      <Button size="sm" variant="destructive" onClick={() => handleCancelShift(shift.shiftId)}>
                        Cancel Shift
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteShift(shift.shiftId)}>
                      Delete Shift
                    </Button>
                    {!shift.caregiverId && (
                      <Select onValueChange={(caregiverId) => handleAssignCaregiver(shift.shiftId, caregiverId)}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Assign Caregiver" />
                        </SelectTrigger>
                        <SelectContent>
                          {caregivers.map((caregiver) => (
                            <SelectItem key={caregiver.id} value={caregiver.id}>
                              {caregiver.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
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
