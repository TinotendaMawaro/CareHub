"use client";

import { MoreHorizontal } from "lucide-react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Shift } from "@/lib/types";
import { getClientName, getCaregiverName } from "@/lib/data";

interface SchedulingTableProps {
  shifts: Shift[];
  onEdit: (shift: Shift) => void;
  onDelete: (shift: Shift) => void;
  onStart: (shift: Shift) => void;
}

export default function SchedulingTable({ shifts, onEdit, onDelete, onStart }: SchedulingTableProps) {

  const getStatusBadge = (status: Shift['status']) => {
    switch (status) {
      case 'Pending':
        return <Badge variant="outline">Pending</Badge>;
      case 'Accepted':
        return <Badge>Accepted</Badge>;
      case 'In Progress':
        return <Badge variant="default">In Progress</Badge>;
      case 'Completed':
        return <Badge variant="secondary">Completed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Client</TableHead>
          <TableHead>Caregiver</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="hidden md:table-cell">Time</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shifts.map((shift) => (
          <TableRow key={shift.id}>
            <TableCell className="font-medium">{shift.clientName || getClientName(shift.clientId)}</TableCell>
            <TableCell>{shift.caregiverName || getCaregiverName(shift.caregiverId)}</TableCell>
            <TableCell>{format(new Date(shift.date), 'MMMM d, yyyy')}</TableCell>
            <TableCell className="hidden md:table-cell">{shift.startTime} - {shift.endTime}</TableCell>
            <TableCell>{getStatusBadge(shift.status)}</TableCell>
            <TableCell>
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
                    <DropdownMenuItem onClick={() => onStart(shift)}>Start Shift</DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onEdit(shift)}>Edit Shift</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDelete(shift)} className="text-destructive">
                    Delete Shift
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
