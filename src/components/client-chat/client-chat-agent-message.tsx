"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ClientChatMessageRow } from "@/lib/client-chat/types";
import { cn } from "@/lib/utils";

type ClientChatAgentMessageProps = {
  message: ClientChatMessageRow;
  senderLabel: string;
  timeLabel: string;
  locale: "en" | "fr";
  canManage: boolean;
  onEdit: (id: string, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  bubbleClassName?: string;
};

const COPY = {
  en: {
    edit: "Edit message",
    delete: "Delete message",
    save: "Save",
    cancel: "Cancel",
    edited: "edited",
    deleteConfirm: "Delete this message?",
  },
  fr: {
    edit: "Modifier",
    delete: "Supprimer",
    save: "Enregistrer",
    cancel: "Annuler",
    edited: "modifié",
    deleteConfirm: "Supprimer ce message ?",
  },
} as const;

export function ClientChatAgentMessage({
  message,
  senderLabel,
  timeLabel,
  locale,
  canManage,
  onEdit,
  onDelete,
  bubbleClassName,
}: ClientChatAgentMessageProps) {
  const t = COPY[locale];
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.message);
  const [busy, setBusy] = useState(false);
  const longPressTimer = useRef<number | null>(null);

  useEffect(() => {
    setEditDraft(message.message);
  }, [message.message]);

  const clearLongPress = () => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const openMenuAt = (clientX: number, clientY: number) => {
    if (!canManage) return;
    setMenuPos({ x: clientX, y: clientY });
    setMenuOpen(true);
  };

  const handleSaveEdit = async () => {
    const text = editDraft.trim();
    if (!text || text === message.message.trim()) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onEdit(message.id, text);
      setEditing(false);
      setMenuOpen(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t.deleteConfirm)) return;
    setBusy(true);
    try {
      await onDelete(message.id);
      setMenuOpen(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className={cn("max-w-[85%] space-y-2", bubbleClassName)}>
        <Textarea
          value={editDraft}
          onChange={(e) => setEditDraft(e.target.value)}
          rows={3}
          className="min-h-[72px] resize-none text-sm"
          disabled={busy}
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setEditDraft(message.message);
              setEditing(false);
            }}
          >
            {t.cancel}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !editDraft.trim()}
            onClick={() => void handleSaveEdit()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : t.save}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={cn("group relative max-w-[85%]", bubbleClassName)}>
        <div
          className={cn(
            "rounded-2xl rounded-br-md bg-[#0f172a] px-3 py-2 text-sm text-white shadow-sm",
            canManage && "cursor-context-menu"
          )}
          onContextMenu={(e) => {
            if (!canManage) return;
            e.preventDefault();
            openMenuAt(e.clientX, e.clientY);
          }}
          onTouchStart={(e) => {
            if (!canManage) return;
            clearLongPress();
            const touch = e.touches[0];
            longPressTimer.current = window.setTimeout(() => {
              openMenuAt(touch.clientX, touch.clientY);
            }, 500);
          }}
          onTouchEnd={clearLongPress}
          onTouchMove={clearLongPress}
        >
          <div className="mb-0.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide opacity-70">
            <span>{senderLabel}</span>
            <span className="font-normal normal-case opacity-60">{timeLabel}</span>
            {message.edited_at ? (
              <span className="font-normal normal-case opacity-50">({t.edited})</span>
            ) : null}
          </div>
          <p className="whitespace-pre-wrap break-words">{message.message}</p>
        </div>

        {canManage ? (
          <button
            type="button"
            aria-label="Message options"
            className="absolute -left-8 top-1/2 hidden -translate-y-1/2 rounded-full p-1 text-muted-foreground opacity-0 transition hover:bg-muted/60 group-hover:opacity-100 sm:inline-flex"
            onClick={(e) => openMenuAt(e.clientX, e.clientY)}
          >
            <MoreHorizontal className="size-4" />
          </button>
        ) : null}
      </div>

      {menuOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[70] cursor-default bg-transparent"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="fixed z-[71] min-w-[10rem] overflow-hidden rounded-xl border border-border/60 bg-popover py-1 shadow-xl"
            style={{
              top: Math.min(menuPos.y, window.innerHeight - 120),
              left: Math.min(menuPos.x, window.innerWidth - 180),
            }}
          >
            <button
              type="button"
              className="block w-full px-4 py-2.5 text-left text-sm hover:bg-muted/60"
              onClick={() => {
                setMenuOpen(false);
                setEditing(true);
              }}
            >
              {t.edit}
            </button>
            <button
              type="button"
              className="block w-full px-4 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10"
              onClick={() => void handleDelete()}
            >
              {t.delete}
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}
