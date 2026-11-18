"use client";

import { useCallback, useEffect, useState } from "react";
import { UserMinus, UserPlus, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { initials } from "@/lib/avatar";
import { assignWorker, unassignWorker } from "@/lib/shiftApi";
import { supabase } from "@/lib/supabase/client";

type Member = { caregiver_id: string; assigned_at: string; caregivers: { name: string; profile_picture_url: string | null } | null };
type Staff = { id: string; name: string };

/**
 * A client's standing support team. Team members are suggested first whenever a shift for this
 * client needs staff, and can read the client's shared documents.
 */
export function ClientTeamPanel({ clientId, clientName }: { clientId: string; clientName: string }) {
  const { toast } = useToast();
  const [team, setTeam] = useState<Member[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [pick, setPick] = useState("");
  const [fill, setFill] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [t, s] = await Promise.all([
      supabase.from("client_caregivers").select("caregiver_id, assigned_at, caregivers(name, profile_picture_url)").eq("client_id", clientId).is("unassigned_at", null).order("assigned_at"),
      supabase.from("caregivers").select("id, name").eq("contract_status", "Active").order("name"),
    ]);
    setTeam((t.data ?? []) as unknown as Member[]);
    setStaff((s.data ?? []) as Staff[]);
  }, [clientId]);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!pick) return;
    setBusy(true);
    try {
      const r = await assignWorker(clientId, pick, fill);
      const who = staff.find((s) => s.id === pick)?.name ?? "Staff member";
      toast({
        title: `${who} joined ${clientName}'s team`,
        description: fill ? `Filled ${r.filled} open shift${r.filled === 1 ? "" : "s"}${r.skipped ? `, skipped ${r.skipped} that clashed` : ""}.` : undefined,
      });
      setPick("");
      await load();
    } catch (e) {
      toast({ title: "Could not add to the team", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: Member) {
    const name = m.caregivers?.name ?? "this staff member";
    if (!window.confirm(`Remove ${name} from ${clientName}'s team?`)) return;
    const clear = window.confirm(`Also unassign ${name} from ${clientName}'s future shifts?\n\nOK = unassign them, Cancel = keep their shifts`);
    setBusy(true);
    try {
      await unassignWorker(clientId, m.caregiver_id, clear);
      toast({ title: `${name} left the team` });
      await load();
    } catch (e) {
      toast({ title: "Could not remove", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const onTeam = new Set(team.map((m) => m.caregiver_id));

  return (
    <div className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold"><Users className="h-4 w-4" />Team</h3>
        <p className="text-xs text-muted-foreground">Team members are suggested first when this client&apos;s shifts need staff, and can read documents shared with workers.</p>
      </div>
      {team.length === 0 && <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No team yet. Add the staff who usually support {clientName}.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {team.map((m) => (
          <div key={m.caregiver_id} className="flex items-center gap-2 rounded-lg border bg-card p-2">
            <Avatar className="h-8 w-8">
              {m.caregivers?.profile_picture_url && <AvatarImage src={m.caregivers.profile_picture_url} alt="" className="object-cover" />}
              <AvatarFallback className="text-xs">{initials(m.caregivers?.name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.caregivers?.name ?? "Unknown staff"}</span>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Remove ${m.caregivers?.name ?? "staff"} from team`} disabled={busy} onClick={() => void remove(m)}>
              <UserMinus className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3 sm:flex-row sm:items-center">
        <select aria-label="Add staff to team" className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Add staff to the team...</option>
          {staff.filter((s) => !onTeam.has(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={fill} onCheckedChange={(v) => setFill(!!v)} />Fill open shifts
        </label>
        <Button size="sm" disabled={!pick || busy} onClick={() => void add()}><UserPlus className="mr-1 h-4 w-4" />Add</Button>
      </div>
    </div>
  );
}
