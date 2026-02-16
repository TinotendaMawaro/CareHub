"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, DollarSign } from "lucide-react";
import { useExpenses } from "@/hooks/use-expenses";
import { useAuth } from "@/hooks/use-auth";
import type { Expense } from "@/lib/types";

const expenseSchema = z.object({
  category: z.enum(["Travel", "Supplies", "Equipment", "Meals", "Other"]),
  description: z.string().min(1, "Description is required"),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  currency: z.string().default("USD"),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

interface ExpenseTrackerProps {
  shiftId?: string;
  clientId?: string;
  caregiverId?: string;
  onExpenseAdded?: () => void;
}

export default function ExpenseTracker({
  shiftId,
  clientId,
  caregiverId,
  onExpenseAdded
}: ExpenseTrackerProps) {
  const { expenses, addExpense, deleteExpense, loading } = useExpenses();
  const { user } = useAuth();
  const [isAddingExpense, setIsAddingExpense] = useState(false);

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      category: "Other",
      description: "",
      amount: 0,
      currency: "USD",
    },
  });

  // Filter expenses for this shift/client/caregiver
  const relevantExpenses = expenses.filter(expense => {
    if (shiftId && expense.shiftId === shiftId) return true;
    if (clientId && expense.clientId === clientId) return true;
    if (caregiverId && expense.caregiverId === caregiverId) return true;
    return false;
  });

  const onSubmit = async (data: ExpenseFormData) => {
    if (!user) return;

    try {
      const expenseData: Omit<Expense, 'id'> = {
        caregiverId: caregiverId || user.uid,
        clientId: clientId,
        shiftId: shiftId,
        category: data.category,
        description: data.description,
        amount: data.amount,
        currency: data.currency,
        date: new Date(),
        status: 'Pending',
        createdAt: new Date(),
      };

      await addExpense(expenseData);
      form.reset();
      setIsAddingExpense(false);
      onExpenseAdded?.();
    } catch (error) {
      console.error("Error adding expense:", error);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    try {
      await deleteExpense(expenseId);
      onExpenseAdded?.();
    } catch (error) {
      console.error("Error deleting expense:", error);
    }
  };

  const totalExpenses = relevantExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Expense Tracking
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              Total: ${totalExpenses.toFixed(2)}
            </Badge>
            <Button
              size="sm"
              onClick={() => setIsAddingExpense(!isAddingExpense)}
              variant="outline"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Expense
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Expense Form */}
        {isAddingExpense && (
          <Card className="border-dashed">
            <CardContent className="pt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Travel">Travel</SelectItem>
                              <SelectItem value="Supplies">Supplies</SelectItem>
                              <SelectItem value="Equipment">Equipment</SelectItem>
                              <SelectItem value="Meals">Meals</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount ($)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe the expense..."
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddingExpense(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={loading}>
                      Add Expense
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* Expenses List */}
        {relevantExpenses.length > 0 ? (
          <div className="space-y-2">
            {relevantExpenses.map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {expense.category}
                    </Badge>
                    <span className="font-medium">${expense.amount.toFixed(2)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {expense.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(expense.date).toLocaleDateString()} •
                    <Badge
                      variant={expense.status === 'Approved' ? 'default' : 'secondary'}
                      className="ml-1 text-xs"
                    >
                      {expense.status}
                    </Badge>
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeleteExpense(expense.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No expenses recorded yet</p>
            <p className="text-sm">Add expenses to track costs for this shift</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
