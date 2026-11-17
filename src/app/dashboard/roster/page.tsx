'use client';
// Week roster with toggle between By participant and By support worker.
// Requires Phase 0 schema: shifts with start_time/end_time, support_families, support_items.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useShifts } from '@/hooks/use-shifts';
import { useCaregivers } from '@/hooks/use-caregivers';
import { useClients } from '@/hooks/use-clients';
import { Button } from '@/components/ui/button';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfWeek(d: Date) {
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() - day);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export default function RosterPage() {
  const router = useRouter();
  const { shifts, loading } = useShifts();
  const { caregivers } = useCaregivers();
  const { clients } = useClients();
  const [mode, setMode] = useState<'participant' | 'worker'>('participant');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const weekDates = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      out.push(d);
    }
    return out;
  }, [weekStart]);

  const shiftMap = useMemo(() => {
    const map = new Map<string, typeof shifts>();
    for (const s of shifts) {
      const key = mode === 'participant' ? s.clientId : s.caregiverId ?? '__unassigned';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [shifts, mode]);

  const rows = useMemo(() => {
    if (mode === 'participant') {
      return clients.map((c) => ({ id: c.id, label: c.fullName ?? c.name, shifts: shiftMap.get(c.id) ?? [] }));
    }
    const workerRows = caregivers.map((c) => ({ id: c.id, label: c.name, shifts: (shiftMap.get(c.id) ?? []).filter((s: any) => s.caregiverId === c.id) }));
    const unassigned = shiftMap.get('__unassigned') ?? [];
    if (unassigned.length) workerRows.push({ id: '__unassigned', label: 'Unassigned', shifts: unassigned });
    return workerRows;
  }, [mode, clients, caregivers, shiftMap]);

  function onAdd(personId: string, date: Date) {
    const dateStr = date.toISOString().slice(0, 10);
    const params = new URLSearchParams();
    if (mode === 'participant') {
      params.set('tab', 'participants');
      params.set('id', personId);
    } else {
      params.set('tab', 'workers');
      if (personId !== '__unassigned') params.set('id', personId);
    }
    params.set('defaultDate', dateStr);
    router.push(`/dashboard/schedule?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Roster</h1>
          <p className="text-sm text-muted-foreground">Week of {weekStart.toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * 86400000))}>Prev</Button>
          <Button variant="outline" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * 86400000))}>Next</Button>
          <div className="ml-2 flex rounded-lg border border-slate-200">
            <button onClick={() => setMode('participant')} className={`px-3 py-1.5 text-sm ${mode === 'participant' ? 'bg-green-600 text-white' : 'text-slate-700'}`}>By participant</button>
            <button onClick={() => setMode('worker')} className={`px-3 py-1.5 text-sm ${mode === 'worker' ? 'bg-green-600 text-white' : 'text-slate-700'}`}>By support worker</button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading roster…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border border-slate-200 text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-200 px-3 py-2 text-left font-medium text-slate-700">{mode === 'participant' ? 'Participant' : 'Support worker'}</th>
                {weekDates.map((d) => (
                  <th key={d.toISOString()} className="border border-slate-200 px-2 py-2 text-center font-medium text-slate-700">
                    <div>{DAYS[d.getDay()]}</div>
                    <div className="text-xs text-slate-500">{d.getDate()}/{d.getMonth() + 1}</div>
                  </th>
                ))}
                <th className="border border-slate-200 px-3 py-2 text-right font-medium text-slate-700">Hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const weeklyHours = row.shifts.reduce((sum: number, s: any) => {
                  const start = new Date(s.startTime);
                  const end = new Date(s.endTime);
                  return sum + (end.getTime() - start.getTime()) / 3_600_000;
                }, 0);
                return (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="border border-slate-200 px-3 py-2 font-medium text-slate-900">{row.label}</td>
                    {weekDates.map((d) => {
                      const dateStr = d.toISOString().slice(0, 10);
                      const dayShifts = row.shifts.filter((s: any) => (s.date ?? s.startTime?.slice(0, 10)) === dateStr);
                      return (
                        <td key={d.toISOString()} className="border border-slate-200 px-1 py-1 align-top">
                          <div className="flex flex-wrap gap-1">
                            {dayShifts.map((s: any) => (
                              <div key={s.id} className={`rounded-md px-1.5 py-1 text-xs ${
                                s.status === 'In Progress' ? 'bg-green-100 text-green-800' :
                                s.status === 'Completed' ? 'bg-slate-100 text-slate-800' :
                                s.status === 'Late' ? 'bg-amber-100 text-amber-800' :
                                s.status === 'No Show' ? 'bg-red-100 text-red-800' :
                                s.status === 'Cancelled' ? 'bg-slate-200 text-slate-500 line-through' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                <div className="font-medium">{new Date(s.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
                                <div className="truncate">{s.caregiverName || s.caregiverId || 'Unassigned'}</div>
                              </div>
                            ))}
                            <Button variant="ghost" size="sm" className="h-7 w-full px-1 text-xs text-slate-500 hover:text-green-700" onClick={() => onAdd(row.id, d)}>+ Add</Button>
                          </div>
                        </td>
                      );
                    })}
                    <td className="border border-slate-200 px-3 py-2 text-right tabular-nums text-slate-700">{weeklyHours.toFixed(1)}h</td>
                  </tr>
                );
              })}
              {rows.length > 0 && (
                <tr className="bg-slate-100 font-medium">
                  <td className="border border-slate-200 px-3 py-2 text-slate-900">Summary</td>
                  {weekDates.map((d) => {
                    const dateStr = d.toISOString().slice(0, 10);
                    const allDayShifts = shifts.filter((s: any) => (s.date ?? s.startTime?.slice(0, 10)) === dateStr);
                    const totalShifts = allDayShifts.length;
                    const unassigned = allDayShifts.filter((s: any) => !s.caregiverId || s.caregiverId === null).length;
                    const dayHours = allDayShifts.reduce((sum: number, s: any) => {
                      const start = new Date(s.startTime);
                      const end = new Date(s.endTime);
                      return sum + (end.getTime() - start.getTime()) / 3_600_000;
                    }, 0);
                    return (
                      <td key={d.toISOString()} className="border border-slate-200 px-2 py-2 text-center text-xs text-slate-700">
                        <div>{totalShifts} shifts</div>
                        <div className="text-amber-700">{unassigned} unassigned</div>
                        <div className="tabular-nums">{dayHours.toFixed(1)}h</div>
                      </td>
                    );
                  })}
                  <td className="border border-slate-200 px-3 py-2 text-right tabular-nums text-slate-700">
                    {shifts.reduce((sum: number, s: any) => {
                      const start = new Date(s.startTime);
                      const end = new Date(s.endTime);
                      return sum + (end.getTime() - start.getTime()) / 3_600_000;
                    }, 0).toFixed(1)}h
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
