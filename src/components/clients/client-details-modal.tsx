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
import { Calendar, Mail, Phone, MapPin, User, FileText, AlertTriangle } from "lucide-react";
import type { Client } from "@/lib/types";

interface ClientDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
}

export default function ClientDetailsModal({
  isOpen,
  onClose,
  client
}: ClientDetailsModalProps) {
  if (!client) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const calculateAge = (dateOfBirth: string) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={client.avatarUrl} alt={client.fullName} />
              <AvatarFallback>{client.fullName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-semibold">{client.fullName}</h2>
              <p className="text-sm text-muted-foreground">Client Details</p>
            </div>
          </DialogTitle>
          <DialogDescription>
            Complete profile information for {client.fullName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Basic Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Date of Birth:</span>
                  <span>{formatDate(client.dateOfBirth)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Age:</span>
                  <span>{calculateAge(client.dateOfBirth)} years old</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Email:</span>
                  <span>{client.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Phone:</span>
                  <span>{client.phone}</span>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Address */}
          <div>
            <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Address
            </h3>
            <p className="text-sm">{client.address}</p>
          </div>

          <Separator />

          {/* Medical Information */}
          <div>
            <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Medical Information
            </h3>
            <div className="space-y-3">
              <div>
                <span className="font-medium text-sm">Diagnosis:</span>
                <Badge variant="outline" className="ml-2">
                  {client.diagnosis}
                </Badge>
              </div>
              <div>
                <span className="font-medium text-sm">Emergency Contact:</span>
                <p className="text-sm mt-1">{client.emergencyContact}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Care Information */}
          <div>
            <h3 className="text-lg font-medium mb-3">Care Information</h3>
            <div className="space-y-3">
              <div>
                <span className="font-medium text-sm">Assigned Caregiver:</span>
                <Badge variant="secondary" className="ml-2">
                  {client.assignedCaregiver || 'Unassigned'}
                </Badge>
              </div>
              <div>
                <span className="font-medium text-sm">Care Needs:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {client.careNeeds.map((need, index) => (
                    <Badge key={index} variant="outline">
                      {need}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {client.notes && (
            <>
              <Separator />
              <div>
                <h3 className="text-lg font-medium mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Notes
                </h3>
                <p className="text-sm text-muted-foreground">{client.notes}</p>
              </div>
            </>
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
