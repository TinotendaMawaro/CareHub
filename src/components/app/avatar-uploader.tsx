"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AVATAR_TYPES, initials, removeAvatar, uploadAvatar } from "@/lib/avatar";
import { cn } from "@/lib/utils";

/**
 * A profile photo with a camera button to change it. The file input lives outside any menu or
 * popover: inputs inside a closing menu unmount before the browser reports the chosen file.
 */
export function AvatarUploader({
  userId, name, url, onChange, size = 96, allowRemove = true, className,
}: {
  userId: string;
  name: string;
  url: string | null;
  onChange?: (url: string | null) => void;
  size?: number;
  allowRemove?: boolean;
  className?: string;
}) {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File) {
    setBusy(true);
    try {
      const next = await uploadAvatar(file, userId, url);
      onChange?.(next);
      toast({ title: "Photo updated" });
    } catch (e) {
      toast({ title: "Could not update the photo", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await removeAvatar(userId, url);
      onChange?.(null);
      toast({ title: "Photo removed" });
    } catch (e) {
      toast({ title: "Could not remove the photo", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <Avatar className="h-full w-full ring-4 ring-background shadow-lg">
          {url && <AvatarImage src={url} alt={name} className="object-cover" />}
          <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary text-lg font-semibold text-primary-foreground" style={{ fontSize: size / 3 }}>
            {initials(name)}
          </AvatarFallback>
        </Avatar>
        <button
          type="button"
          aria-label="Change photo"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </button>
        <input
          ref={input}
          type="file"
          accept={AVATAR_TYPES.join(",")}
          className="hidden"
          data-testid="avatar-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void pick(f);
          }}
        />
      </div>
      {allowRemove && url && (
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void remove()} className="text-muted-foreground">
          <Trash2 className="mr-1 h-4 w-4" />Remove photo
        </Button>
      )}
    </div>
  );
}
