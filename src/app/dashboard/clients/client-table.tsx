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
import { getCaregiverName } from "@/lib/data";

export default function ClientTable({ clients }: { clients: Client[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="hidden w-[100px] sm:table-cell">
            <span className="sr-only">Avatar</span>
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Age</TableHead>
          <TableHead className="hidden md:table-cell">Address</TableHead>
          <TableHead className="hidden md:table-cell">Care Needs</TableHead>
          <TableHead>Assigned Caregiver</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clients.map((client) => (
          <TableRow key={client.id}>
            <TableCell className="hidden sm:table-cell">
              <Avatar className="h-10 w-10">
                <AvatarImage src={client.avatarUrl} alt={client.name} />
                <AvatarFallback>{client.name.charAt(0)}</AvatarFallback>
              </Avatar>
            </TableCell>
            <TableCell className="font-medium">{client.name}</TableCell>
            <TableCell>{client.age}</TableCell>
            <TableCell className="hidden md:table-cell">
              {client.address}
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <div className="flex flex-wrap gap-1">
                {client.careNeeds.map((need) => (
                  <Badge key={need} variant="secondary">
                    {need}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell>{client.assignedCaregiverId ? getCaregiverName(client.assignedCaregiverId) : 'Unassigned'}</TableCell>
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
                  <DropdownMenuItem>Edit</DropdownMenuItem>
                  <DropdownMenuItem>View Details</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">
                    Delete
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
