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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { useState } from "react";
import type { Caregiver, Client } from "@/lib/types";
import { getCaregiverAvatarUrl } from "@/lib/utils";

interface CaregiverTableProps {
  caregivers: Caregiver[];
  clients?: Client[];
  onEdit: (caregiver: Caregiver) => void;
  onDelete: (caregiverId: string) => void;
  onAssignToClient?: (caregiverId: string, clientId: string) => void;
}

export default function CaregiverTable({
  caregivers,
  clients,
  onEdit,
  onDelete,
  onAssignToClient
}: CaregiverTableProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [caregiverToDelete, setCaregiverToDelete] = useState<string | null>(null);

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
  };

  const handleDeleteClick = (caregiverId: string) => {
    setCaregiverToDelete(caregiverId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (caregiverToDelete) {
      onDelete(caregiverToDelete);
      setCaregiverToDelete(null);
    }
    setDeleteDialogOpen(false);
  };


  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="hidden w-[100px] sm:table-cell">
              <span className="sr-only">Avatar</span>
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Experience</TableHead>
            <TableHead className="hidden md:table-cell">Qualifications</TableHead>
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
                  <AvatarImage src={getCaregiverAvatarUrl(caregiver)} alt={caregiver.name} />
                  <AvatarFallback>{caregiver.name.charAt(0)}</AvatarFallback>
                </Avatar>
              </TableCell>
              <TableCell className="font-medium">{caregiver.name}</TableCell>
              <TableCell>{caregiver.email}</TableCell>
              <TableCell>{caregiver.experience} years</TableCell>
              <TableCell className="hidden md:table-cell">
                <div className="flex flex-wrap gap-1">
                  {(caregiver.qualifications || []).slice(0, 2).map((qualification) => (
                    <Badge key={qualification} variant="outline">
                      {qualification}
                    </Badge>
                  ))}
                  {(caregiver.qualifications || []).length > 2 && <Badge variant="outline">...</Badge>}
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
                    <DropdownMenuItem onClick={() => onEdit(caregiver)}>
                      Edit Caregiver
                    </DropdownMenuItem>
                    <DropdownMenuItem>View Schedule</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleDeleteClick(caregiver.id)}
                    >
                      Delete Caregiver
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the caregiver
              and remove their data from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
