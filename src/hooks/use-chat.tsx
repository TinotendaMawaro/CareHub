"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { subscribeToTable } from "@/lib/supabase/realtime";
import { useAuth } from "./use-auth";
import type { ChatChannel, ChatMessage } from "@/lib/types";

export type DirectoryPerson = { id: string; name: string; avatarUrl?: string; role: string };

const mapMessage = (r: any): ChatMessage => ({
  id: r.id, channelId: r.channel_id, senderId: r.sender_id, body: r.body,
  attachmentUrl: r.attachment_url ?? undefined, createdAt: new Date(r.created_at),
  editedAt: r.edited_at ? new Date(r.edited_at) : undefined, deleted: !!r.deleted,
});

export function useDirectory() {
  const [people, setPeople] = useState<DirectoryPerson[]>([]);
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    void supabase.from("staff_directory").select("*").order("name").then(({ data }) =>
      setPeople((data ?? []).map((r: any) => ({ id: r.id, name: r.name, avatarUrl: r.avatar_url ?? undefined, role: r.role })))
    );
  }, [user]);
  return people;
}

/** Channels, groups and DMs the signed-in user is in, plus public channels they could join. */
export function useChannels() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [joinable, setJoinable] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [mine, open] = await Promise.all([
      supabase.from("chat_overview").select("*"),
      supabase.from("chat_channels").select("id,name").eq("kind", "channel").eq("is_private", false),
    ]);
    const list: ChatChannel[] = (mine.data ?? []).map((r: any) => ({
      channelId: r.channel_id, name: r.name ?? undefined, kind: r.kind, isPrivate: r.is_private, description: r.description ?? undefined,
      unread: Number(r.unread ?? 0), lastMessageAt: r.last_message_at ? new Date(r.last_message_at) : undefined, dmUserId: r.dm_user_id ?? undefined,
    }));
    list.sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));
    setChannels(list);
    const mineIds = new Set(list.map((c) => c.channelId));
    setJoinable((open.data ?? []).filter((c: any) => !mineIds.has(c.id)).map((c: any) => ({ id: c.id, name: c.name })));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
    const offs = [subscribeToTable("chat_messages", () => void load(), { event: "INSERT" }), subscribeToTable("chat_members", () => void load())];
    return () => offs.forEach((o) => o());
  }, [user, load]);

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(error.message);
    await load();
    return data as string;
  };

  return {
    channels, joinable, loading, reload: load,
    createChannel: (name: string, kind: "channel" | "group", members: string[], isPrivate = false, description?: string) =>
      rpc("create_channel", { p_name: name, p_kind: kind, p_members: members, p_private: isPrivate, p_description: description ?? null }),
    openDm: (otherUserId: string) => rpc("get_or_create_dm", { p_other: otherUserId }),
    join: (id: string) => rpc("join_channel", { p_channel: id }),
    addMember: (channelId: string, userId: string) => rpc("add_channel_member", { p_channel: channelId, p_user: userId }),
  };
}

export function useMessages(channelId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const seen = useRef(new Set<string>());

  const markRead = useCallback(async () => {
    if (channelId) await supabase.rpc("mark_channel_read", { p_channel: channelId });
  }, [channelId]);

  useEffect(() => {
    seen.current = new Set();
    setMessages([]);
    if (!channelId || !user) return;
    let active = true;
    setLoading(true);

    void supabase
      .from("chat_messages").select("*").eq("channel_id", channelId).eq("deleted", false)
      .order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => {
        if (!active) return;
        const list = (data ?? []).map(mapMessage).reverse();
        list.forEach((m) => seen.current.add(m.id));
        setMessages(list);
        setLoading(false);
        void markRead();
      });

    const off = subscribeToTable("chat_messages", (p) => {
      const row = p.new;
      if (!row || row.channel_id !== channelId) return;
      const m = mapMessage(row);
      if (m.deleted) return setMessages((prev) => prev.filter((x) => x.id !== m.id));
      setMessages((prev) => (seen.current.has(m.id) ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m]));
      seen.current.add(m.id);
      if (m.senderId !== user.id) void markRead();
    }, { filter: `channel_id=eq.${channelId}` });

    return () => { active = false; off(); };
  }, [channelId, user, markRead]);

  const send = useCallback(async (body: string, attachmentUrl?: string) => {
    const text = body.trim();
    if (!text || !channelId || !user) return;
    const { data, error } = await supabase
      .from("chat_messages").insert({ channel_id: channelId, sender_id: user.id, body: text, attachment_url: attachmentUrl ?? null })
      .select("*").single();
    if (error) throw new Error(error.message);
    const m = mapMessage(data);
    // The realtime echo may arrive first or second; the seen-set makes either order safe.
    if (!seen.current.has(m.id)) { seen.current.add(m.id); setMessages((prev) => [...prev, m]); }
  }, [channelId, user]);

  const remove = useCallback(async (id: string) => {
    await supabase.from("chat_messages").update({ deleted: true }).eq("id", id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { messages, loading, send, remove };
}
