"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import type { Client, IncidentReport } from "@/lib/types";

interface IncidentFormProps {
  clients: Client[];
  onSubmit: (data: Omit<IncidentReport, 'id'>) => Promise<void>;
}

export default function IncidentForm({ clients, onSubmit }: IncidentFormProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    clientId: '',
    severity: '',
    date: '',
    time: '',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        clientId: formData.clientId,
        caregiverId: user.uid, // Assuming current user is the caregiver reporting
        date: formData.date,
        time: formData.time,
        description: formData.description,
        severity: formData.severity as 'Low' | 'Medium' | 'High',
        status: 'Unresolved',
      });

      toast({
        title: "Success",
        description: "Incident report submitted successfully",
      });

      // Reset form
      setFormData({
        clientId: '',
        severity: '',
        date: '',
        time: '',
        description: '',
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit incident report",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>New Incident Report</CardTitle>
        <CardDescription>
          Fill out the details of the incident below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="client">Client</Label>
              <Select value={formData.clientId} onValueChange={(value) => handleChange('clientId', value)}>
                <SelectTrigger id="client">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="severity">Severity</Label>
              <Select value={formData.severity} onValueChange={(value) => handleChange('severity', value)}>
                <SelectTrigger id="severity">
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
                <Label htmlFor="date">Date of Incident</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleChange('date', e.target.value)}
                  required
                />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="time">Time of Incident</Label>
                <Input
                  id="time"
                  type="time"
                  value={formData.time}
                  onChange={(e) => handleChange('time', e.target.value)}
                  required
                />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description of Incident</Label>
            <Textarea
              id="description"
              placeholder="Provide a detailed account of what happened..."
              className="min-h-32"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              required
            />
          </div>
          <CardFooter className="border-t px-0 py-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Report"}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
