"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Minus, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pager, usePaged } from "@/components/ui/pager";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type AppRole, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { initials } from "@/lib/avatar";
import { PERMISSIONS, ROLE_DESCRIPTION, ROLE_LABEL, ROLES } from "@/lib/roles";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Person = { id: string; email: string; first_name: string | null; last_name: string | null; role: AppRole; active: boolean; avatar_url: string | null };

const fullName = (p: Person) => [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email;

export function RolesPanel() {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const [people, setPeople] = useState<Person[]>([]);
  const [filter, setFilter] = useState<AppRole | "all">("all");
  const [q, setQ] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id,email,first_name,last_name,role,active,avatar_url").order("first_name");
    setPeople((data ?? []) as Person[]);
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: people.length };
    for (const r of ROLES) c[r] = people.filter((p) => p.role === r).length;
    return c;
  }, [people]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return people.filter((p) => (filter === "all" || p.role === filter) && (!s || fullName(p).toLowerCase().includes(s) || p.email.toLowerCase().includes(s)));
  }, [people, filter, q]);
  const paged = usePaged(shown, 10, `${filter}|${q}`);

  async function changeRole(p: Person, role: AppRole) {
    if (role === p.role) return;
    if (!window.confirm(`Change ${fullName(p)} from ${ROLE_LABEL[p.role]} to ${ROLE_LABEL[role]}?`)) return;
    const { error } = await supabase.from("profiles").update({ role }).eq("id", p.id);
    if (error) return toast({ title: "Could not change role", description: error.message, variant: "destructive" });
    toast({ title: `${fullName(p)} is now ${ROLE_LABEL[role]}` });
    await load();
  }

  const areas = [...new Set(PERMISSIONS.map((p) => p.area))];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {(["all", ...ROLES] as const).map((r) => (
          <button
            key={r}
            onClick={() => setFilter(r)}
            className={cn(
              "rounded-xl border bg-card p-4 text-left transition-all hover:shadow-md",
              filter === r && "border-primary ring-2 ring-primary/20",
            )}
          >
            <p className="text-2xl font-semibold tabular-nums">{loaded ? counts[r] ?? 0 : "–"}</p>
            <p className="truncate text-sm text-muted-foreground">{r === "all" ? "Everyone" : ROLE_LABEL[r]}</p>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>
              {filter === "all" ? "Everyone with a CareHub login." : ROLE_DESCRIPTION[filter]}
              {!isAdmin && " Only administrators can change roles."}
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="hidden md:table-cell">Email</TableHead><TableHead>Role</TableHead><TableHead className="text-right">Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {paged.rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {p.avatar_url && <AvatarImage src={p.avatar_url} alt="" className="object-cover" />}
                          <AvatarFallback className="text-xs">{initials(fullName(p))}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{fullName(p)}</p>
                          <p className="truncate text-xs text-muted-foreground md:hidden">{p.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-[260px] truncate md:table-cell">{p.email}</TableCell>
                    <TableCell>
                      {isAdmin && p.id !== user?.id ? (
                        <select
                          aria-label={`Role for ${fullName(p)}`}
                          className="h-9 rounded-lg border border-input bg-card px-2 text-sm shadow-sm"
                          value={p.role}
                          onChange={(e) => void changeRole(p, e.target.value as AppRole)}
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </select>
                      ) : (
                        <Badge variant="secondary">{ROLE_LABEL[p.role]}{p.id === user?.id ? " (you)" : ""}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.active ? <span className="text-sm text-emerald-700">Active</span> : <span className="text-sm text-muted-foreground">Deactivated</span>}
                    </TableCell>
                  </TableRow>
                ))}
                {!loaded && (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">Loading users...</TableCell></TableRow>
                )}
                {loaded && paged.rows.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No users match.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <Pager {...paged.pager} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
          <CardDescription>What each role can do. The database enforces these rules, so they apply in the web app, the staff app and the API alike.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[260px]">Permission</TableHead>
                {ROLES.map((r) => <TableHead key={r} className="text-center">{ROLE_LABEL[r]}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {areas.map((area) => (
                <Fragment key={area}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={ROLES.length + 1} className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{area}</TableCell>
                  </TableRow>
                  {PERMISSIONS.filter((p) => p.area === area).map((p) => (
                    <TableRow key={`${area}-${p.action}`}>
                      <TableCell className="text-sm">{p.action}</TableCell>
                      {ROLES.map((r) => (
                        <TableCell key={r} className="text-center">
                          {p.roles.includes(r)
                            ? <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Allowed" />
                            : <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" aria-label="Not allowed" />}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
