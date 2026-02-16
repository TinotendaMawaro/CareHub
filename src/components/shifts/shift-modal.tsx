"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useClients } from "@/hooks/use-clients";
import { useCaregivers } from "@/hooks/use-caregivers";
import { useShifts } from "@/hooks/use-shifts";
import { useAuth } from "@/hooks/use-auth";
import { Checkbox } from "@/components/ui/checkbox";
import type { Shift } from "@/lib/types";

const shiftSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  caregiverId: z.string().optional(),
  serviceType: z.enum(["aged_care", "ndis", "intercompany", "other"]),
  startTime: z.date({ required_error: "Start time is required" }),
  endTime: z.date({ required_error: "End time is required" }),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  allowOverlap: z.boolean(),
});

type ShiftFormData = z.infer<typeof shiftSchema>;

interface ShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  shift?: Shift;
}

export default function ShiftModal({ isOpen, onClose, shift }: ShiftModalProps) {
  const { clients } = useClients();
  const { caregivers } = useCaregivers();
  const { createShift, updateShift } = useShifts();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const form = useForm<ShiftFormData>({
    resolver: zodResolver(shiftSchema),
    defaultValues: {
      clientId: "",
      caregiverId: "",
      serviceType: "aged_care",
      startTime: new Date(),
      endTime: new Date(),
      latitude: 0,
      longitude: 0,
      allowOverlap: false,
    },
  });

  useEffect(() => {
    if (shift) {
      form.reset({
        clientId: shift.clientId,
        caregiverId: shift.caregiverId || "",
        serviceType: shift.serviceType,
        startTime: shift.startTime,
        endTime: shift.endTime,
        latitude: shift.location.latitude,
        longitude: shift.location.longitude,
        allowOverlap: shift.allowOverlap,
      });
    } else {
      form.reset({
        clientId: "",
        caregiverId: "",
        serviceType: "aged_care",
        startTime: new Date(),
        endTime: new Date(),
        latitude: 0,
        longitude: 0,
        allowOverlap: false,
      });
    }
  }, [shift, form]);

  useEffect(() => {
    if (!isOpen) {
      setDatePickerOpen(false);
    }
  }, [isOpen]);

  const onSubmit = async (data: ShiftFormData) => {
    if (!user) {
      console.error("User not authenticated");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const shiftData = {
        clientId: data.clientId,
        caregiverId: data.caregiverId || null,
        serviceType: data.serviceType,
        startTime: data.startTime,
        endTime: data.endTime,
        location: {
          latitude: data.latitude,
          longitude: data.longitude,
        },
        status: 'Scheduled' as const, // Initial status
        allowOverlap: data.allowOverlap,
        deleted: false,
        createdBy: user.uid,
        createdAt: now,
        modifiedBy: user.uid,
        modifiedAt: now,
      };

      if (shift) {
        await updateShift(shift.shiftId, {
          ...shiftData,
          createdBy: shift.createdBy,
          createdAt: shift.createdAt,
        });
      } else {
        await createShift(shiftData);
      }
      onClose();
    } catch (error) {
      console.error("Error saving shift:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog key={shift?.shiftId || 'new'} open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{shift ? "Edit Shift" : "Create New Shift"}</DialogTitle>
          <DialogDescription>
            {shift ? "Update the shift details." : "Fill in the details to create a new shift."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
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
              name="caregiverId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Caregiver (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a caregiver" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {caregivers.map((caregiver) => (
                        <SelectItem key={caregiver.id} value={caregiver.id}>
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
              name="serviceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select service type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="aged_care">Aged Care</SelectItem>
                      <SelectItem value="ndis">NDIS</SelectItem>
                      <SelectItem value="intercompany">Intercompany</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Start Time</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP p")
                            ) : (
                              <span>Pick start time</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            if (date) {
                              const currentTime = field.value || new Date();
                              date.setHours(currentTime.getHours(), currentTime.getMinutes());
                              field.onChange(date);
                            }
                          }}
                        />
                        <div className="p-3 border-t">
                          <Input
                            type="time"
                            value={field.value ? format(field.value, "HH:mm") : ""}
                            onChange={(e) => {
                              const [hours, minutes] = e.target.value.split(":");
                              const newDate = new Date(field.value || new Date());
                              newDate.setHours(parseInt(hours), parseInt(minutes));
                              field.onChange(newDate);
                            }}
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>End Time</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP p")
                            ) : (
                              <span>Pick end time</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            if (date) {
                              const currentTime = field.value || new Date();
                              date.setHours(currentTime.getHours(), currentTime.getMinutes());
                              field.onChange(date);
                            }
                          }}
                        />
                        <div className="p-3 border-t">
                          <Input
                            type="time"
                            value={field.value ? format(field.value, "HH:mm") : ""}
                            onChange={(e) => {
                              const [hours, minutes] = e.target.value.split(":");
                              const newDate = new Date(field.value || new Date());
                              newDate.setHours(parseInt(hours), parseInt(minutes));
                              field.onChange(newDate);
                            }}
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="latitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitude</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="longitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longitude</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="allowOverlap"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Allow Overlap</FormLabel>
                  </div>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : shift ? "Update Shift" : "Create Shift"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
