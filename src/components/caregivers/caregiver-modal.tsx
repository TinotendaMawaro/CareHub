"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import type { Caregiver } from "@/lib/types";
import { storage } from "@/lib/firebase/client";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Camera, Upload, MapPin, Clock, CheckCircle, XCircle, Calendar, Users, FileText } from "lucide-react";
import { getCaregiverAvatarUrl } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useShifts } from "@/hooks/use-shifts";
import { useTimeOffRequests } from "@/hooks/use-timeOffRequests";
import { useLocations } from "@/hooks/use-locations";
import { useClients } from "@/hooks/use-clients";

const caregiverSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(1, "Phone number is required"),
  qualifications: z.string().min(1, "Qualifications are required"),
  experience: z.number().min(0, "Experience must be a positive number"),
  skills: z.string().min(1, "Skills are required"),
  availability: z.enum(['Available', 'Unavailable', 'On Shift']),
});

type CaregiverFormData = z.infer<typeof caregiverSchema>;

interface CaregiverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Caregiver, 'id'>) => Promise<void>;
  caregiver?: Caregiver | null;
  loading?: boolean;
  isViewMode?: boolean;
}

export default function CaregiverModal({
  isOpen,
  onClose,
  onSubmit,
  caregiver,
  loading = false,
  isViewMode = false
}: CaregiverModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState<string>("");

  const form = useForm<CaregiverFormData>({
    resolver: zodResolver(caregiverSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      qualifications: "",
      experience: 0,
      skills: "",
      availability: 'Available',
    },
  });

  useEffect(() => {
    if (caregiver) {
      form.reset({
        name: caregiver.name,
        email: caregiver.email,
        phone: caregiver.phone,
        qualifications: caregiver.qualifications ? caregiver.qualifications.join(', ') : '',
        experience: caregiver.experience,
        skills: caregiver.skills ? caregiver.skills.join(', ') : '',
        availability: caregiver.availability,
      });
      setProfilePicturePreview(getCaregiverAvatarUrl(caregiver));
    } else {
      form.reset({
        name: "",
        email: "",
        phone: "",
        qualifications: "",
        experience: 0,
        skills: "",
        availability: 'Available',
      });
      setProfilePicturePreview("");
    }
    setProfilePictureFile(null);
  }, [caregiver, form]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setProfilePictureFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setProfilePicturePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadProfilePicture = async (): Promise<string | undefined> => {
    if (!profilePictureFile) return caregiver?.profilePictureUrl;

    try {
      const storageRef = ref(storage, `caregivers/${Date.now()}_${profilePictureFile.name}`);
      const snapshot = await uploadBytes(storageRef, profilePictureFile);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error("Error uploading profile picture:", error);
      throw new Error("Failed to upload profile picture");
    }
  };

  const handleSubmit = async (data: CaregiverFormData) => {
    setIsSubmitting(true);
    try {
      const profilePictureUrl = await uploadProfilePicture();
      await onSubmit({
        ...data,
        qualifications: data.qualifications.split(',').map(q => q.trim()),
        skills: data.skills.split(',').map(s => s.trim()),
        profilePictureUrl,
        contractStatus: 'Active',
        evvCompliance: 'Unknown',
        clientsWorkedWith: [],
        clientsInductedFor: []
      });
      onClose();
      form.reset();
      setProfilePictureFile(null);
      setProfilePicturePreview("");
    } catch (error) {
      console.error("Error submitting caregiver:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // View mode rendering
  if (isViewMode && caregiver) {
    const { shifts } = useShifts();
    const { timeOffRequests } = useTimeOffRequests();
    const { locations } = useLocations();
    const { clients } = useClients();

    const caregiverShifts = shifts.filter(shift => shift.caregiverId === caregiver.id);
    const currentShift = caregiverShifts.find(shift => shift.status === 'In Progress');
    const pendingLeaves = timeOffRequests.filter(req => req.caregiverId === caregiver.id && req.status === 'Pending');
    const approvedLeaves = timeOffRequests.filter(req => req.caregiverId === caregiver.id && req.status === 'Approved');
    const recentLocations = locations.filter(loc => loc.caregiverId === caregiver.id).slice(0, 5);
    const workedClients = clients.filter(client => caregiver.clientsWorkedWith.includes(client.id));
    const inductedClients = clients.filter(client => caregiver.clientsInductedFor.includes(client.id));

    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={getCaregiverAvatarUrl(caregiver)} alt={caregiver.name} />
                <AvatarFallback>{caregiver.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-xl font-semibold">{caregiver.name}</h2>
                <p className="text-sm text-muted-foreground">Caregiver Profile</p>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Status Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Status Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">Availability</p>
                    <Badge variant={caregiver.availability === 'Available' ? 'default' : 'secondary'}>
                      {caregiver.availability}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Contract Status</p>
                    <Badge variant={caregiver.contractStatus === 'Active' ? 'default' : 'destructive'}>
                      {caregiver.contractStatus}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">EVV Compliance</p>
                    <Badge variant={caregiver.evvCompliance === 'On Location' ? 'default' : 'secondary'}>
                      {caregiver.evvCompliance}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Current Shift</p>
                    <p className="text-sm">{currentShift ? `${currentShift.clientName} (${currentShift.status})` : 'No active shift'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Work History */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Work History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm"><strong>Assigned & Past Shifts:</strong> {caregiverShifts.length} shifts</p>
                  <p className="text-sm"><strong>Clients Worked With:</strong> {workedClients.length} clients</p>
                  <p className="text-sm"><strong>Clients Inducted For:</strong> {inductedClients.length} clients</p>
                </div>
              </CardContent>
            </Card>

            {/* Leave Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Leave Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm"><strong>Pending Leave:</strong> {pendingLeaves.length} requests</p>
                  <p className="text-sm"><strong>Approved Leave:</strong> {approvedLeaves.length} requests</p>
                </div>
              </CardContent>
            </Card>

            {/* EVV Map */}
            <EVVMap caregiverId={caregiver.id} />
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto mx-4">
        <DialogHeader>
          <DialogTitle>
            {caregiver ? "Edit Caregiver" : "Add New Caregiver"}
          </DialogTitle>
          <DialogDescription>
            {caregiver
              ? "Update the caregiver information below."
              : "Fill in the details to add a new caregiver to the system."
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Profile Picture Upload */}
            <div className="flex flex-col items-center space-y-4">
              <Avatar className="h-20 sm:h-24 w-20 sm:w-24">
                <AvatarImage src={profilePicturePreview} alt="Profile picture" />
                <AvatarFallback>
                  <Camera className="h-6 sm:h-8 w-6 sm:w-8" />
                </AvatarFallback>
              </Avatar>
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  id="profile-picture-upload"
                />
                <label htmlFor="profile-picture-upload">
                  <Button type="button" variant="outline" size="sm" asChild>
                    <span className="cursor-pointer">
                      <Upload className="mr-2 h-4 w-4" />
                      {caregiver ? "Change Photo" : "Upload Photo"}
                    </span>
                  </Button>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="(555) 123-4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="experience"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Experience (years)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="5"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="qualifications"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Qualifications</FormLabel>
                  <FormControl>
                    <Input placeholder="CNA, CPR Certified, etc. (comma separated)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="skills"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Skills</FormLabel>
                  <FormControl>
                    <Input placeholder="Patient care, medication administration, etc. (comma separated)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="availability"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Availability</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select availability" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Available">Available</SelectItem>
                      <SelectItem value="Unavailable">Unavailable</SelectItem>
                      <SelectItem value="On Shift">On Shift</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || loading} className="w-full sm:w-auto">
                {isSubmitting ? "Saving..." : caregiver ? "Update Caregiver" : "Add Caregiver"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
