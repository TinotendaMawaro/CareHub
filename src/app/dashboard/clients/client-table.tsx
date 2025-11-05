"use client";

import { MoreHorizontal } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Client } from "@/lib/types";

interface ClientTableProps {
  clients: Client[];
  onEdit?: (client: Client) => void;
  onDelete?: (clientId: string) => void;
  onViewDetails?: (client: Client) => void;
  onViewSchedule?: (client: Client) => void;
}

export default function ClientTable({ clients, onEdit, onDelete, onViewDetails, onViewSchedule }: ClientTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="hidden w-[100px] sm:table-cell">
            <span className="sr-only">Avatar</span>
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Age</TableHead>
          <TableHead className="hidden md:table-cell">Email</TableHead>
          <TableHead className="hidden md:table-cell">Phone</TableHead>
          <TableHead className="hidden lg:table-cell">Diagnosis</TableHead>
          <TableHead>Assigned Caregiver</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clients.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
              No clients found.
            </TableCell>
          </TableRow>
        ) : (
          clients.map((client) => (
            <TableRow key={client.id}>
              <TableCell className="hidden sm:table-cell">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={client.avatarUrl} alt={client.fullName} />
                  <AvatarFallback>{client.fullName.charAt(0)}</AvatarFallback>
                </Avatar>
              </TableCell>
              <TableCell className="font-medium">{client.fullName}</TableCell>
              <TableCell>{client.age}</TableCell>
              <TableCell className="hidden md:table-cell">
                {client.email}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {client.phone}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <Badge variant="outline">{client.diagnosis}</Badge>
              </TableCell>
              <TableCell>{client.assignedCaregiver || 'Unassigned'}</TableCell>
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
                    {onViewDetails && (
                      <DropdownMenuItem onClick={() => onViewDetails(client)}>
                        View Details
                      </DropdownMenuItem>
                    )}
                    {onViewSchedule && (
                      <DropdownMenuItem onClick={() => onViewSchedule(client)}>
                        View Schedule
                      </DropdownMenuItem>
                    )}
                    {onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(client)}>
                        Edit
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onDelete(client.id)}
                      >
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
