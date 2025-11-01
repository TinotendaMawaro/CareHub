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
import type { Caregiver } from "@/lib/types";

export default function CaregiverTable({ caregivers }: { caregivers: Caregiver[] }) {

  const getAvailabilityBadge = (availability: Caregiver['availability']) => {
    switch (availability) {
      case 'Available':
        return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Available</Badge>;
      case 'On Shift':
        return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">On Shift</Badge>;
      case 'Unavailable':
        return <Badge variant="destructive">Unavailable</Badge>;
      default:
        return <Badge variant="secondary">{availability}</Badge>;
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="hidden w-[100px] sm:table-cell">
            <span className="sr-only">Avatar</span>
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Experience</TableHead>
          <TableHead className="hidden md:table-cell">Skills</TableHead>
          <TableHead>Availability</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {caregivers.map((caregiver) => (
          <TableRow key={caregiver.id}>
            <TableCell className="hidden sm:table-cell">
              <Avatar className="h-10 w-10">
                <AvatarImage src={caregiver.avatarUrl} alt={caregiver.name} />
                <AvatarFallback>{caregiver.name.charAt(0)}</AvatarFallback>
              </Avatar>
            </TableCell>
            <TableCell className="font-medium">{caregiver.name}</TableCell>
            <TableCell>{caregiver.experience} years</TableCell>
            <TableCell className="hidden md:table-cell">
              <div className="flex flex-wrap gap-1">
                {caregiver.skills.slice(0, 3).map((skill) => (
                  <Badge key={skill} variant="outline">
                    {skill}
                  </Badge>
                ))}
                {caregiver.skills.length > 3 && <Badge variant="outline">...</Badge>}
              </div>
            </TableCell>
            <TableCell>{getAvailabilityBadge(caregiver.availability)}</TableCell>
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
                  <DropdownMenuItem>View Schedule</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">
                    Deactivate
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
