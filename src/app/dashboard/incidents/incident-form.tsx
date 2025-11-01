"use client";

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
import type { Client } from "@/lib/types";

export default function IncidentForm({ clients }: { clients: Client[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>New Incident Report</CardTitle>
        <CardDescription>
          Fill out the details of the incident below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="client">Client</Label>
              <Select>
                <SelectTrigger id="client">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="severity">Severity</Label>
              <Select>
                <SelectTrigger id="severity">
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
                <Label htmlFor="date">Date of Incident</Label>
                <Input id="date" type="date" />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="time">Time of Incident</Label>
                <Input id="time" type="time" />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description of Incident</Label>
            <Textarea
              id="description"
              placeholder="Provide a detailed account of what happened..."
              className="min-h-32"
            />
          </div>
        </form>
      </CardContent>
      <CardFooter className="border-t px-6 py-4">
        <Button>Submit Report</Button>
      </CardFooter>
    </Card>
  );
}
