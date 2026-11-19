"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClients } from "@/hooks/use-clients";
import { useParticipantPlans, usePlanBudgets, useBudgetSummary, useExpensesNew, useBudgetAdjustments } from "@/hooks/use-budgets";
import { useShifts } from "@/hooks/use-shifts";
import ShiftTable from "@/components/scheduling/ShiftTable";
import { ArrowLeft, Plus, Download, CalendarDays } from "lucide-react";
import Link from "next/link";
import { downloadCsv } from "@/lib/csv";
import type { ParticipantPlan, PlanBudget, BudgetSummary, NewExpense, BudgetAdjustment } from "@/lib/types";

export default function ClientProfilePage() {
  const params = useParams();
  const clientId = params.id as string;
  const { clients } = useClients();
  const client = clients.find((c) => c.id === clientId);
  const { plans, loading: plansLoading, createPlan } = useParticipantPlans(clientId);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const { budgets, loading: budgetsLoading, upsertBudget } = usePlanBudgets(selectedPlanId);
  const { summary: budgetSummary, loading: summaryLoading } = useBudgetSummary(selectedPlanId);
  const { expenses, loading: expensesLoading, addExpense } = useExpensesNew(clientId, selectedPlanId);
  const { adjustments, addAdjustment } = useBudgetAdjustments(selectedPlanId);
  const { shifts, caregivers: allCaregivers } = useShifts();
  const clientShifts = useMemo(() => shifts.filter((s) => s.clientId === clientId), [shifts, clientId]);

  useEffect(() => {
    if (plans.length > 0 && !selectedPlanId) {
      const active = plans.find((p) => p.status === "active");
      setSelectedPlanId(active ? active.id : plans[0].id);
    }
  }, [plans, selectedPlanId]);

  if (!client) {
    return <div className="p-6">Client not found.</div>;
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const summaryByCategory = new Map(budgetSummary.map((s) => [s.categoryNo, s]));

  const handleAddExpense = async () => {
    await addExpense({
      caregiverId: "",
      clientId,
      planId: selectedPlanId,
      kind: "other",
      description: "New expense",
      incurredOn: new Date().toISOString().split("T")[0],
      amount: 0,
      reimburseWorker: false,
      status: "pending",
    });
  };

  const handleAddAdjustment = async () => {
    await addAdjustment({
      planId: selectedPlanId,
      amount: 0,
      reason: "Manual adjustment",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/dashboard/clients">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold font-headline">{client.fullName}</h1>
            <p className="text-sm text-muted-foreground">Client profile</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/print/calendar?kind=client&id=${client.id}`}><CalendarDays className="mr-1.5 h-4 w-4" />Print calendar</Link>
          </Button>
          <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue placeholder="Select plan" />
            </SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.startDate} - {p.endDate} ({p.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!selectedPlan && (
            <Button onClick={() => createPlan({ clientId, startDate: new Date().toISOString().split("T")[0], endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], managementType: "self_managed" })}>
              <Plus className="mr-2 h-4 w-4" /> New Plan
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="plan">Plan and funding</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Client Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{client.fullName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{client.email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date of Birth</p>
                <p className="font-medium">{client.dateOfBirth}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant="outline">{client.status}</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plan" className="space-y-4">
          {selectedPlan ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Plan Header</CardTitle>
                  <CardDescription>
                    {selectedPlan.startDate} to {selectedPlan.endDate}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Management</p>
                    <p className="font-medium">{selectedPlan.managementType}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Plan Manager</p>
                    <p className="font-medium">{selectedPlan.planManagerName ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">NDIS Number</p>
                    <p className="font-medium">{selectedPlan.ndisNumber ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant="outline">{selectedPlan.status}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Budgets by Category</CardTitle>
                  <CardDescription>Allocated, spent, committed and remaining.</CardDescription>
                </CardHeader>
                <CardContent>
                  {budgets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No budgets set for this plan.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Allocated</TableHead>
                          <TableHead className="text-right">Spent</TableHead>
                          <TableHead className="text-right">Committed</TableHead>
                          <TableHead className="text-right">Remaining</TableHead>
                          <TableHead className="text-right">Used</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {budgets.map((b) => {
                          const summary = summaryByCategory.get(b.categoryNo);
                          return (
                            <TableRow key={b.id}>
                              <TableCell className="font-medium">{summary?.name ?? b.categoryNo}</TableCell>
                              <TableCell className="text-right tabular-nums">${b.allocated.toFixed(2)}</TableCell>
                              <TableCell className="text-right tabular-nums">${summary?.spent.toFixed(2) ?? "0.00"}</TableCell>
                              <TableCell className="text-right tabular-nums">${summary?.committed.toFixed(2) ?? "0.00"}</TableCell>
                              <TableCell className="text-right tabular-nums">${summary?.remaining.toFixed(2) ?? "0.00"}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center gap-2">
                                  <Progress value={summary?.percentUsed ?? 0} className="w-16" />
                                  <span className="text-xs">{summary?.percentUsed.toFixed(1) ?? 0}%</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No active plan</CardTitle>
                <CardDescription>Create a plan to view budgets and funding.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
              <CardDescription>Shifts for {client.fullName}</CardDescription>
            </CardHeader>
            <CardContent>
              <ShiftTable shifts={clientShifts} caregivers={allCaregivers} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Expenses</h2>
            <Button onClick={handleAddExpense}>
              <Plus className="mr-2 h-4 w-4" /> Add Expense
            </Button>
          </div>
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.incurredOn}</TableCell>
                    <TableCell>{e.description}</TableCell>
                    <TableCell className="text-right tabular-nums">${e.amount.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={e.status === "approved" ? "default" : "outline"}>{e.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="ledger" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Budget Ledger</h2>
            <Button
              variant="outline"
              disabled={!selectedPlan || adjustments.length === 0}
              onClick={() => downloadCsv(
                `ledger-${client.fullName.replace(/[^\w-]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`,
                [["Date", "Type", "Category", "State", "Amount"],
                  ...adjustments.map((a) => [new Date(a.createdAt).toLocaleDateString("en-AU"), "Adjustment", a.categoryNo ?? "", "spent", a.amount.toFixed(2)])],
              )}
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
          {!selectedPlan ? (
            <p className="text-sm text-muted-foreground">Select a plan to view the ledger.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{new Date(a.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>Adjustment</TableCell>
                    <TableCell>{a.categoryNo ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">spent</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">${a.amount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
