"use client";

import { useState } from "react";
import { PlusCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ClientTable from "./client-table";
import ClientModal from "@/components/clients/client-modal";
import ClientDetailsModal from "@/components/clients/client-details-modal";
import ClientScheduleModal from "@/components/clients/client-schedule-modal";
import { useClients } from "@/hooks/use-clients";
import type { Client } from "@/lib/types";

export default function ClientsPage() {
  const { clients, loading, addClient, updateClient, deleteClient } = useClients();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "age" | "assignedCaregiver">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [detailsClient, setDetailsClient] = useState<Client | null>(null);
  const [scheduleClient, setScheduleClient] = useState<Client | null>(null);

  // Filter and sort clients
  const filteredClients = clients
    .filter((client) =>
      client.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.address.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortBy) {
        case "name":
          aValue = a.fullName.toLowerCase();
          bValue = b.fullName.toLowerCase();
          break;
        case "age":
          aValue = a.age;
          bValue = b.age;
          break;
        case "assignedCaregiver":
          aValue = a.assignedCaregiver.toLowerCase();
          bValue = b.assignedCaregiver.toLowerCase();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

  const handleAddClient = async (data: any) => {
    const clientData = {
      ...data,
      name: data.fullName,
      age: new Date().getFullYear() - new Date(data.dateOfBirth).getFullYear(),
      contact: data.phone,
      careNeeds: [data.diagnosis],
      assignedCaregiverId: "", // Will be set based on caregiver name
      avatarUrl: data.avatarUrl || `https://picsum.photos/seed/${data.fullName}/100/100`,
    };
    await addClient(clientData);
  };

  const handleEditClient = async (data: any) => {
    if (!editingClient) return;
    const clientData = {
      ...data,
      name: data.fullName,
      age: new Date().getFullYear() - new Date(data.dateOfBirth).getFullYear(),
      contact: data.phone,
      careNeeds: [data.diagnosis],
      assignedCaregiverId: "", // Will be set based on caregiver name
      avatarUrl: data.avatarUrl || editingClient.avatarUrl,
    };
    await updateClient(editingClient.id, clientData);
  };

  const handleDeleteClient = async (clientId: string) => {
    if (confirm("Are you sure you want to delete this client?")) {
      await deleteClient(clientId);
    }
  };

  const openAddModal = () => {
    setEditingClient(null);
    setIsModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setIsModalOpen(true);
  };

  const openDetailsModal = (client: Client) => {
    setDetailsClient(client);
  };

  const openScheduleModal = (client: Client) => {
    setScheduleClient(client);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-headline">Clients</h1>
          <p className="text-muted-foreground">Manage your client profiles and care needs.</p>
        </div>
        <Button onClick={openAddModal}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add Client
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Client List</CardTitle>
          <CardDescription>
            A list of all clients in the CareHub system.
          </CardDescription>
          <div className="flex items-center space-x-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 border border-input bg-background rounded-md"
              aria-label="Sort clients by"
            >
              <option value="name">Sort by Name</option>
              <option value="age">Sort by Age</option>
              <option value="assignedCaregiver">Sort by Caregiver</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            >
              {sortOrder === "asc" ? "↑" : "↓"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">Loading clients...</div>
          ) : (
            <ClientTable
              clients={filteredClients}
              onEdit={openEditModal}
              onDelete={handleDeleteClient}
              onViewDetails={openDetailsModal}
              onViewSchedule={openScheduleModal}
            />
          )}
        </CardContent>
      </Card>

      <ClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={editingClient ? handleEditClient : handleAddClient}
        client={editingClient}
      />

      <ClientDetailsModal
        isOpen={!!detailsClient}
        onClose={() => {
          setDetailsClient(null);
        }}
        client={detailsClient}
      />

      <ClientScheduleModal
        isOpen={!!scheduleClient}
        onClose={() => setScheduleClient(null)}
        client={scheduleClient}
      />
    </div>
  );
}
