"use client";

import { useState } from "react";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCaregivers } from "@/hooks/use-caregivers";
import CaregiverTable from "./caregiver-table";
import CaregiverModal from "@/components/caregivers/caregiver-modal";
import { toast } from "@/hooks/use-toast";
import type { Caregiver } from "@/lib/types";

export default function CaregiversPage() {
  const { caregivers, loading: caregiversLoading, addCaregiver, updateCaregiver, deleteCaregiver } = useCaregivers();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCaregiver, setEditingCaregiver] = useState<Caregiver | null>(null);

  const handleAddCaregiver = () => {
    setEditingCaregiver(null);
    setIsModalOpen(true);
  };

  const handleEditCaregiver = (caregiver: Caregiver) => {
    setEditingCaregiver(caregiver);
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (data: any) => {
    try {
      if (editingCaregiver) {
        await updateCaregiver(editingCaregiver.id, data);
        toast({
          title: "Success",
          description: "Caregiver updated successfully",
        });
      } else {
        await addCaregiver(data);
        toast({
          title: "Success",
          description: "Caregiver added successfully",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save caregiver",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCaregiver = async (caregiverId: string) => {
    try {
      await deleteCaregiver(caregiverId);
      toast({
        title: "Success",
        description: "Caregiver deleted successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete caregiver",
        variant: "destructive",
      });
    }
  };


  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
         <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-headline">Caregivers</h1>
            <p className="text-muted-foreground">Manage your caregiver profiles and availability.</p>
        </div>
        <Button onClick={handleAddCaregiver} className="w-full sm:w-auto">
          <PlusCircle className="mr-2 h-4 w-4" /> Add Caregiver
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Caregiver List</CardTitle>
          <CardDescription>
            A list of all caregivers in the CareHub system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CaregiverTable
            caregivers={caregivers}
            onEdit={handleEditCaregiver}
            onDelete={handleDeleteCaregiver}
          />
        </CardContent>
      </Card>

      <CaregiverModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        caregiver={editingCaregiver}
        loading={caregiversLoading}
      />
    </div>
  );
}
