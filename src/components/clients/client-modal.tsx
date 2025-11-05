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
import type { Client } from "@/lib/types";
import { caregivers } from "@/lib/data";
import { storage } from "@/lib/firebase/client";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Camera, Upload } from "lucide-react";

const clientSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  address: z.string().min(1, "Address is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(1, "Phone number is required"),
  emergencyContact: z.string().min(1, "Emergency contact is required"),
  diagnosis: z.string().min(1, "Diagnosis is required"),
  notes: z.string().optional(),
  assignedCaregiver: z.string().optional(),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ClientFormData & { avatarUrl?: string }) => Promise<void>;
  client?: Client | null;
  loading?: boolean;
}

export default function ClientModal({
  isOpen,
  onClose,
  onSubmit,
  client,
  loading = false
}: ClientModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      fullName: "",
      dateOfBirth: "",
      address: "",
      email: "",
      phone: "",
      emergencyContact: "",
      diagnosis: "",
      notes: "",
      assignedCaregiver: "",
    },
  });

  useEffect(() => {
    if (client) {
      form.reset({
        fullName: client.fullName,
        dateOfBirth: client.dateOfBirth,
        address: client.address,
        email: client.email,
        phone: client.phone,
        emergencyContact: client.emergencyContact,
        diagnosis: client.diagnosis,
        notes: client.notes || "",
        assignedCaregiver: client.assignedCaregiver,
      });
      setAvatarPreview(client.avatarUrl);
    } else {
      form.reset({
        fullName: "",
        dateOfBirth: "",
        address: "",
        email: "",
        phone: "",
        emergencyContact: "",
        diagnosis: "",
        notes: "",
        assignedCaregiver: "",
      });
      setAvatarPreview("");
    }
    setAvatarFile(null);
  }, [client, form]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadAvatar = async (): Promise<string | undefined> => {
    if (!avatarFile) return client?.avatarUrl;

    try {
      const storageRef = ref(storage, `clients/${Date.now()}_${avatarFile.name}`);
      const snapshot = await uploadBytes(storageRef, avatarFile);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error("Error uploading avatar:", error);
      throw new Error("Failed to upload profile picture");
    }
  };

  const handleSubmit = async (data: ClientFormData) => {
    setIsSubmitting(true);
    try {
      const avatarUrl = await uploadAvatar();
      await onSubmit({ ...data, avatarUrl });
      onClose();
      form.reset();
      setAvatarFile(null);
      setAvatarPreview("");
    } catch (error) {
      console.error("Error submitting client:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {client ? "Edit Client" : "Add New Client"}
          </DialogTitle>
          <DialogDescription>
            {client
              ? "Update the client information below."
              : "Fill in the details to add a new client to the system."
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Profile Picture Upload */}
            <div className="flex flex-col items-center space-y-4">
              <Avatar className="h-24 w-24">
                <AvatarImage src={avatarPreview} alt="Profile picture" />
                <AvatarFallback>
                  <Camera className="h-8 w-8" />
                </AvatarFallback>
              </Avatar>
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  id="avatar-upload"
                />
                <label htmlFor="avatar-upload">
                  <Button type="button" variant="outline" size="sm" asChild>
                    <span className="cursor-pointer">
                      <Upload className="mr-2 h-4 w-4" />
                      {client ? "Change Photo" : "Upload Photo"}
                    </span>
                  </Button>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Birth</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Main St, City, State" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            <FormField
              control={form.control}
              name="emergencyContact"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Emergency Contact</FormLabel>
                  <FormControl>
                    <Input placeholder="Jane Doe - (555) 987-6543" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="diagnosis"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Diagnosis</FormLabel>
                  <FormControl>
                    <Input placeholder="Medical condition or diagnosis" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="assignedCaregiver"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assigned Caregiver</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a caregiver" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {caregivers.map((caregiver) => (
                        <SelectItem key={caregiver.id} value={caregiver.name}>
                          {caregiver.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional notes about the client..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || loading}>
                {isSubmitting ? "Saving..." : client ? "Update Client" : "Add Client"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
