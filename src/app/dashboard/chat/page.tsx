"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Hash, Lock, MessageSquarePlus, Send, Trash2, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { useChannels, useDirectory, useMessages } from "@/hooks/use-chat";
import { useToast } from "@/hooks/use-toast";
import { formatWhen } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function ChatPage() {
  const { user, isOffice } = useAuth();
  const { toast } = useToast();
  const people = useDirectory();
  const { channels, joinable, createChannel, openDm, join, addMember } = useChannels();
  const [activeId, setActiveId] = useState<string | null>(null);
  const { messages, send, remove } = useMessages(activeId);
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [form, setForm] = useState({ name: "", kind: "channel" as "channel" | "group", isPrivate: false, description: "", members: [] as string[] });
  const bottom = useRef<HTMLDivElement>(null);

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Someone";
  const label = (c: (typeof channels)[number]) => (c.kind === "dm" ? nameOf(c.dmUserId ?? "") : c.name ?? "Untitled");
  const active = channels.find((c) => c.channelId === activeId);

  useEffect(() => { if (!activeId && channels.length) setActiveId(channels[0].channelId); }, [channels, activeId]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages.length, activeId]);

  const fail = (e: unknown) => toast({ title: "Could not do that", description: (e instanceof Error ? e.message : String(e)).replace(/^[a-z_]+: /, ""), variant: "destructive" });

  async function submit() {
    const text = draft;
    setDraft("");
    try { await send(text); } catch (e) { setDraft(text); fail(e); }
  }

  async function create() {
    if (!form.name.trim()) return;
    try {
      const id = await createChannel(form.name, form.kind, form.members, form.isPrivate, form.description || undefined);
      setActiveId(id); setCreating(false);
      setForm({ name: "", kind: "channel", isPrivate: false, description: "", members: [] });
    } catch (e) { fail(e); }
  }

  const others = people.filter((p) => p.id !== user?.id);
  const grouped = useMemo(() => ({
    channels: channels.filter((c) => c.kind !== "dm"),
    dms: channels.filter((c) => c.kind === "dm"),
  }), [channels]);

  const Row = ({ c }: { c: (typeof channels)[number] }) => (
    <button onClick={() => setActiveId(c.channelId)}
      className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted", c.channelId === activeId && "bg-muted font-medium")}>
      {c.kind === "dm" ? <span className="h-2 w-2 rounded-full bg-emerald-500" /> : c.isPrivate ? <Lock className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
      <span className="flex-1 truncate">{label(c)}</span>
      {c.unread > 0 && <Badge className="h-5 px-1.5">{c.unread}</Badge>}
    </button>
  );

  return (
    <div className="grid h-[calc(100vh-9rem)] min-h-[28rem] grid-cols-1 overflow-hidden rounded-lg border bg-background md:grid-cols-[18rem_1fr]">
      <aside className="flex flex-col border-b md:border-b-0 md:border-r">
        <div className="flex items-center justify-between p-3">
          <h1 className="font-semibold">Chat</h1>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" title="Direct message" onClick={() => setDmOpen(true)}><MessageSquarePlus className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" title="New channel or group" onClick={() => setCreating(true)}><Users className="h-4 w-4" /></Button>
          </div>
        </div>
        <ScrollArea className="flex-1 px-2">
          <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase text-muted-foreground">Channels and groups</p>
          {grouped.channels.map((c) => <Row key={c.channelId} c={c} />)}
          {grouped.channels.length === 0 && <p className="px-2 text-xs text-muted-foreground">None yet.</p>}
          <p className="px-2 pb-1 pt-4 text-xs font-medium uppercase text-muted-foreground">Direct messages</p>
          {grouped.dms.map((c) => <Row key={c.channelId} c={c} />)}
          {joinable.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-4 text-xs font-medium uppercase text-muted-foreground">Browse channels</p>
              {joinable.map((c) => (
                <button key={c.id} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
                  onClick={() => join(c.id).then(() => setActiveId(c.id)).catch(fail)}>
                  <Hash className="h-3.5 w-3.5" /><span className="flex-1 truncate">{c.name}</span><span className="text-xs">Join</span>
                </button>
              ))}
            </>
          )}
        </ScrollArea>
      </aside>

      <section className="flex min-h-0 flex-col">
        {!active ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">Pick a conversation or start a new one.</div>
        ) : (
          <>
            <header className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="font-semibold">{active.kind === "dm" ? label(active) : `${active.isPrivate ? "" : "#"}${label(active)}`}</h2>
                {active.description && <p className="text-xs text-muted-foreground">{active.description}</p>}
              </div>
              {active.kind !== "dm" && (
                <select className="h-8 rounded-md border bg-background px-2 text-xs" value="" aria-label="Add a person"
                  onChange={(e) => e.target.value && addMember(active.channelId, e.target.value).then(() => toast({ title: "Person added" })).catch(fail)}>
                  <option value="">Add person...</option>
                  {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </header>
            <ScrollArea className="flex-1 px-4 py-3">
              <div className="space-y-3">
                {messages.map((m, i) => {
                  const mine = m.senderId === user?.id;
                  const showName = i === 0 || messages[i - 1].senderId !== m.senderId;
                  return (
                    <div key={m.id} className={cn("group flex flex-col", mine ? "items-end" : "items-start")}>
                      {showName && <span className="mb-0.5 text-xs text-muted-foreground">{mine ? "You" : nameOf(m.senderId)} | {formatWhen(m.createdAt)}</span>}
                      <div className={cn("flex max-w-[80%] items-start gap-1", mine && "flex-row-reverse")}>
                        <p className={cn("whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>{m.body}</p>
                        {(mine || isOffice) && (
                          <button className="invisible p-1 text-muted-foreground hover:text-destructive group-hover:visible" aria-label="Delete message" onClick={() => void remove(m.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottom} />
              </div>
            </ScrollArea>
            <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message" maxLength={4000} />
              <Button type="submit" disabled={!draft.trim()}><Send className="h-4 w-4" /></Button>
            </form>
          </>
        )}
      </section>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New {form.kind}</DialogTitle>
            <DialogDescription>Channels suit topics for everyone (e.g. rosters). Groups are private chats between chosen people.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              {isOffice && <Button type="button" size="sm" variant={form.kind === "channel" ? "default" : "outline"} onClick={() => setForm({ ...form, kind: "channel" })}>Channel</Button>}
              <Button type="button" size="sm" variant={form.kind === "group" ? "default" : "outline"} onClick={() => setForm({ ...form, kind: "group" })}>Private group</Button>
            </div>
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={form.kind === "channel" ? "e.g. roster-updates" : "e.g. Maple House team"} /></div>
            {form.kind === "channel" && (
              <>
                <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isPrivate} onCheckedChange={(v) => setForm({ ...form, isPrivate: !!v })} />Private (invite only)</label>
              </>
            )}
            <div>
              <Label>Add people</Label>
              <ScrollArea className="h-40 rounded-md border p-2">
                {others.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 py-1 text-sm">
                    <Checkbox checked={form.members.includes(p.id)} onCheckedChange={() => setForm({ ...form, members: form.members.includes(p.id) ? form.members.filter((x) => x !== p.id) : [...form.members, p.id] })} />
                    {p.name} <span className="text-xs text-muted-foreground">{p.role}</span>
                  </label>
                ))}
              </ScrollArea>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button onClick={create} disabled={!form.name.trim()}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dmOpen} onOpenChange={setDmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Message someone</DialogTitle></DialogHeader>
          <ScrollArea className="h-72">
            {others.map((p) => (
              <button key={p.id} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                onClick={() => openDm(p.id).then((id) => { setActiveId(id); setDmOpen(false); }).catch(fail)}>
                <span>{p.name}</span><span className="text-xs text-muted-foreground">{p.role}</span>
              </button>
            ))}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
