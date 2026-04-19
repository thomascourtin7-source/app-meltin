"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  Loader2,
  MoreVertical,
  Paperclip,
  Reply,
  Send,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocalStorageString } from "@/hooks/use-local-storage-string";
import {
  savePushSubscriptionToServer,
  subscribeChatPush,
} from "@/lib/push/client-subscribe-chat";
import { CHAT_USERNAME_STORAGE_KEY } from "@/lib/chat/constants";
import { getSupabaseBrowserClient, type MessageRow } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { InvisibleCloseLayer } from "./invisible-close-layer";

const ROOM_ID = "general";
const CHAT_ATTACHMENTS_BUCKET = "chat-attachments";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/**
 * Pixels entre le bas du layout viewport et le bas de la visual viewport
 * (clavier + barre accessoire iOS). À utiliser sur le composer (sticky/fixed).
 */
function useVisualViewportKeyboardInset(enabled: boolean) {
  const [insetPx, setInsetPx] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const overlap = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop
      );
      setInsetPx(overlap);
    };

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [enabled]);

  return insetPx;
}
/** Ancienne clé — migrée une fois vers {@link CHAT_USERNAME_STORAGE_KEY} */
const LEGACY_DISPLAY_NAME_KEY = "meltin_chat_display_name";

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function findLastAt(text: string, cursor: number): number {
  const slice = text.slice(0, cursor);
  const lastAt = slice.lastIndexOf("@");
  if (lastAt === -1) return -1;
  if (/\n/.test(slice.slice(lastAt + 1))) return -1;
  return lastAt;
}

function getMentionContext(text: string, cursor: number): {
  atIndex: number;
  query: string;
} | null {
  const atIndex = findLastAt(text, cursor);
  if (atIndex === -1) return null;
  return { atIndex, query: text.slice(atIndex + 1, cursor) };
}

function filterMentionCandidates(names: string[], query: string): string[] {
  const q = query.toLowerCase();
  const filtered = names.filter((n) => {
    const ln = n.toLowerCase();
    return q.length === 0 || ln.startsWith(q) || ln.includes(q);
  });
  return [...new Set(filtered)]
    .sort((a, b) => a.localeCompare(b, "fr"))
    .slice(0, 8);
}

function replySnippet(row: MessageRow): string {
  if (row.image_url?.trim() && !row.content.trim()) return "Photo";
  const t = row.content.trim();
  if (!t) return row.image_url?.trim() ? "Photo" : "Message";
  return t.length > 72 ? `${t.slice(0, 69)}…` : t;
}

function MessageContentWithMentions({
  text,
  mentionNames,
  mine,
}: {
  text: string;
  mentionNames: string[];
  mine: boolean;
}) {
  const sorted = [...new Set(mentionNames)].sort((a, b) => b.length - a.length);
  const mentionClass = mine
    ? "font-semibold text-zinc-100 underline decoration-white/40"
    : "font-semibold text-zinc-800 underline decoration-zinc-400/70";

  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < text.length) {
    const at = text.indexOf("@", i);
    if (at === -1) {
      out.push(<span key={key++}>{text.slice(i)}</span>);
      break;
    }
    if (at > i) {
      out.push(<span key={key++}>{text.slice(i, at)}</span>);
    }
    const beforeChar = at === 0 ? " " : text[at - 1];
    if (at > 0 && beforeChar !== " " && beforeChar !== "\n" && beforeChar !== "\t") {
      out.push(<span key={key++}>@</span>);
      i = at + 1;
      continue;
    }
    let matched = false;
    for (const name of sorted) {
      const needle = `@${name}`;
      if (!text.startsWith(needle, at)) continue;
      const end = at + needle.length;
      const next = text[end];
      if (
        next === undefined ||
        next === "\n" ||
        /\s/.test(next) ||
        /[.,!?;:]/.test(next)
      ) {
        out.push(
          <span key={key++} className={mentionClass}>
            {needle}
          </span>
        );
        i = end;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push(<span key={key++}>@</span>);
      i = at + 1;
    }
  }

  return (
    <p className="whitespace-pre-wrap break-words">
      {out}
    </p>
  );
}

type ChatVariant = "desktop" | "page";

type ChatProps = {
  variant: ChatVariant;
};

export function Chat({ variant }: ChatProps) {
  const [isMounted, setIsMounted] = useState(false);
  const usernameStore = useLocalStorageString(CHAT_USERNAME_STORAGE_KEY, "");
  const [onboardingDraft, setOnboardingDraft] = useState("");
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(() =>
    Boolean(getSupabaseBrowserClient())
  );
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null);
  const [selectionStart, setSelectionStart] = useState(0);
  const [mentionHighlightIdx, setMentionHighlightIdx] = useState(0);
  const mentionIdxRef = useRef(0);
  const lastMentionAtRef = useRef<number | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [openMessageMenuId, setOpenMessageMenuId] = useState<string | null>(null);
  const [chatPushStatus, setChatPushStatus] = useState<
    "idle" | "loading" | "subscribed" | "error"
  >("idle");
  const [chatPushMessage, setChatPushMessage] = useState<string | null>(null);
  const [chatPushOfflineHint, setChatPushOfflineHint] = useState(false);
  const editingMessageIdRef = useRef<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  /** Si false, l’utilisateur a scrollé vers le haut — pas d’auto-scroll sur nouveaux messages. */
  const stickToBottomRef = useRef(true);
  const composerRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [composerHeightPx, setComposerHeightPx] = useState(132);
  /** Hauteur max de la zone messages (VisualViewport iOS) */
  const [messagesMaxHeightPx, setMessagesMaxHeightPx] = useState<number | null>(
    null
  );

  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const keyboardInsetPx = useVisualViewportKeyboardInset(variant === "page");

  const scrollIntoViewOnMobileFocus = useCallback(
    (el: HTMLElement | null) => {
      if (variant !== "page" || !el) return;
      requestAnimationFrame(() => {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    },
    [variant]
  );

  const handleMessagesScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = gap < 56;
  }, []);

  const scrollToBottomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  /** `force: true` = focus sur l’input (toujours). Sinon = resize viewport, seulement si stick au bas. */
  const scrollToBottom = useCallback(
    (opts: { force: boolean }) => {
      if (variant !== "page") return;
      if (!opts.force && !stickToBottomRef.current) return;
      if (opts.force) stickToBottomRef.current = true;
      if (scrollToBottomTimerRef.current) {
        clearTimeout(scrollToBottomTimerRef.current);
      }
      scrollToBottomTimerRef.current = setTimeout(() => {
        scrollToBottomTimerRef.current = null;
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        messagesEndRef.current?.scrollIntoView({
          block: "end",
          behavior: "smooth",
        });
      }, 240);
    },
    [variant]
  );

  const handleTextareaFocus = useCallback(() => {
    scrollToBottom({ force: true });
  }, [scrollToBottom]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- montage client uniquement
    setIsMounted(true);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollToBottomTimerRef.current) {
        clearTimeout(scrollToBottomTimerRef.current);
      }
    };
  }, []);

  const configError =
    !supabase
      ? "Variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY manquantes."
      : null;

  const persistUsername = useCallback(
    (name: string) => {
      usernameStore.setValue(name.trim());
    },
    [usernameStore]
  );

  /** Migration ancien localStorage + synchro prénom au montage client */
  useEffect(() => {
    if (!isMounted || typeof window === "undefined") return;
    try {
      const current = window.localStorage.getItem(CHAT_USERNAME_STORAGE_KEY)?.trim();
      const legacy = window.localStorage.getItem(LEGACY_DISPLAY_NAME_KEY)?.trim();
      if (!current && legacy) {
        persistUsername(legacy);
        window.localStorage.removeItem(LEGACY_DISPLAY_NAME_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [isMounted, persistUsername]);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    void (async () => {
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("messages")
        .select("id, room_id, sender_name, content, image_url, reply_to_id, is_edited, created_at")
        .eq("room_id", ROOM_ID)
        .order("created_at", { ascending: true })
        .limit(200);

      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        setMessages([]);
      } else {
        const rows = ((data as unknown as MessageRow[]) ?? []).map((row) => ({
          ...row,
          reply_to_id: row.reply_to_id ?? null,
          image_url: row.image_url ?? null,
          is_edited: row.is_edited ?? false,
        }));
        setMessages(rows);
      }
      setLoading(false);
    })();

    const channelId = `room_general_${Date.now()}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const raw = payload.new as MessageRow;
          const row: MessageRow = {
            ...raw,
            reply_to_id: raw.reply_to_id ?? null,
            image_url: raw.image_url ?? null,
            is_edited: raw.is_edited ?? false,
          };
          if (row.room_id !== ROOM_ID) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row].sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime()
            );
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const raw = payload.new as MessageRow;
          const row: MessageRow = {
            ...raw,
            reply_to_id: raw.reply_to_id ?? null,
            image_url: raw.image_url ?? null,
            is_edited: raw.is_edited ?? false,
          };
          if (row.room_id !== ROOM_ID) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === row.id ? row : m))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => {
          const oldRow = payload.old as { id?: string };
          const id = oldRow.id;
          if (!id) return;
          const wasEditing = editingMessageIdRef.current === id;
          setMessages((prev) => prev.filter((m) => m.id !== id));
          setEditingMessageId((eid) => (eid === id ? null : eid));
          if (wasEditing) setDraft("");
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (variant === "page" && !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, variant]);

  const trimmedName = usernameStore.value.trim();
  const hasUsername = trimmedName.length > 0;

  useLayoutEffect(() => {
    if (variant !== "page" || !hasUsername) return;
    const el = composerRef.current;
    if (!el) return;
    const sync = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setComposerHeightPx(h);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [variant, hasUsername, keyboardInsetPx]);

  /** VisualViewport : hauteur de la zone messages + scroll bas après resize (clavier iOS). */
  useEffect(() => {
    if (variant !== "page") {
      setMessagesMaxHeightPx(null);
      return;
    }
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const updateHeight = () => {
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;
      const top = scrollEl.getBoundingClientRect().top;
      const bottomVisible = vv.offsetTop + vv.height;
      setMessagesMaxHeightPx(Math.max(120, bottomVisible - top - 4));
    };

    const onViewportChange = () => {
      updateHeight();
      scrollToBottom({ force: false });
    };

    vv.addEventListener("resize", onViewportChange);
    vv.addEventListener("scroll", onViewportChange);
    window.addEventListener("resize", updateHeight);
    updateHeight();
    const t = window.setTimeout(updateHeight, 0);
    const ro = new ResizeObserver(updateHeight);
    const el = scrollRef.current;
    if (el) ro.observe(el);
    return () => {
      window.clearTimeout(t);
      vv.removeEventListener("resize", onViewportChange);
      vv.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("resize", updateHeight);
      ro.disconnect();
    };
  }, [
    variant,
    keyboardInsetPx,
    composerHeightPx,
    messages.length,
    hasUsername,
    scrollToBottom,
  ]);

  useEffect(() => {
    if (!hasUsername || typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    let cancelled = false;
    void (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        if (cancelled || regs.length === 0) return;
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) setChatPushStatus("subscribed");
      } catch {
        /* pas de SW ou pas encore enregistré */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasUsername]);

  /** Réassocie l’abonnement push navigateur au prénom courant (`user_name` Supabase). */
  useEffect(() => {
    if (!hasUsername || !trimmedName) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    let cancelled = false;
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (cancelled || !sub) return;
        const raw = sub.toJSON();
        if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) return;
        await savePushSubscriptionToServer(
          {
            endpoint: raw.endpoint,
            expirationTime: raw.expirationTime,
            keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth },
          },
          trimmedName
        );
      } catch {
        /* hors-ligne ou quota */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasUsername, trimmedName]);

  const disconnectProfile = useCallback(() => {
    usernameStore.clear();
    setEditingName(false);
    setOnboardingDraft("");
    setChatPushStatus("idle");
    setChatPushMessage(null);
    setChatPushOfflineHint(false);
  }, [usernameStore]);

  const onEnableChatPush = useCallback(async () => {
    setChatPushMessage(null);
    setChatPushOfflineHint(false);
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    if (!vapid) {
      window.alert("Clé VAPID manquante");
      setChatPushStatus("error");
      setChatPushMessage("Clé VAPID manquante (NEXT_PUBLIC_VAPID_PUBLIC_KEY).");
      return;
    }
    setChatPushStatus("loading");
    console.log("[Chat] navigator.serviceWorker.register /sw.js", {
      origin: window.location.origin,
      href: window.location.href,
      port: window.location.port,
    });
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      console.log("[Chat] Service Worker enregistré", {
        scope: registration.scope,
        state: registration.active?.state ?? registration.installing?.state,
      });
    } catch (e) {
      console.error("[Chat] Échec navigator.serviceWorker.register", e);
      setChatPushStatus("error");
      setChatPushMessage(
        e instanceof Error
          ? e.message
          : "Échec de l’enregistrement du Service Worker."
      );
      return;
    }
    const r = await subscribeChatPush(trimmedName);
    if (r.ok) {
      setChatPushStatus("subscribed");
    } else {
      setChatPushStatus("error");
      if (r.offline) {
        setChatPushOfflineHint(true);
        setChatPushMessage(null);
      } else {
        setChatPushOfflineHint(false);
        setChatPushMessage(r.error);
      }
    }
  }, [trimmedName]);

  const participantNames = useMemo(() => {
    const s = new Set<string>();
    for (const m of messages) {
      const n = m.sender_name.trim();
      if (n) s.add(n);
    }
    if (trimmedName) s.add(trimmedName);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "fr"));
  }, [messages, trimmedName]);

  const mentionCtx = useMemo(
    () => getMentionContext(draft, selectionStart),
    [draft, selectionStart]
  );

  const mentionCandidates = useMemo(
    () =>
      mentionCtx
        ? filterMentionCandidates(participantNames, mentionCtx.query)
        : [],
    [mentionCtx, participantNames]
  );

  const mentionHighlightSafe = Math.min(
    mentionHighlightIdx,
    Math.max(0, mentionCandidates.length - 1)
  );

  const editingTarget = useMemo(
    () =>
      editingMessageId
        ? messages.find((m) => m.id === editingMessageId)
        : undefined,
    [editingMessageId, messages]
  );

  useEffect(() => {
    editingMessageIdRef.current = editingMessageId;
  }, [editingMessageId]);

  useEffect(() => {
    if (!openMessageMenuId) return;
    const close = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-slot="message-actions"]')) return;
      setOpenMessageMenuId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openMessageMenuId]);

  const saveOnboardingName = useCallback(() => {
    const t = onboardingDraft.trim();
    if (t.length < 1) {
      setOnboardingError("Indiquez au moins une lettre.");
      return;
    }
    if (t.length > 120) {
      setOnboardingError("120 caractères maximum.");
      return;
    }
    setOnboardingError(null);
    persistUsername(t);
    setOnboardingDraft("");
  }, [onboardingDraft, persistUsername]);

  const canSend = Boolean(
    hasUsername &&
      supabase &&
      !sending &&
      !uploadingImage &&
      !configError &&
      (editingMessageId
        ? Boolean(
            editingTarget &&
              (draft.trim().length > 0 ||
                Boolean(editingTarget.image_url?.trim()))
          )
        : draft.trim().length > 0)
  );

  const canAttach = Boolean(
    hasUsername &&
      supabase &&
      !sending &&
      !uploadingImage &&
      !configError &&
      !editingMessageId
  );

  const sendMessage = useCallback(async () => {
    if (!supabase || !canSend) return;
    const content = draft.trim();

    if (editingMessageId) {
      const target = messages.find((m) => m.id === editingMessageId);
      if (!target) return;
      if (!content && !target.image_url?.trim()) return;
      setSending(true);
      setError(null);
      const { data: updated, error: upErr } = await supabase
        .from("messages")
        .update({ content, is_edited: true })
        .eq("id", editingMessageId)
        .select("id, room_id, sender_name, content, image_url, reply_to_id, is_edited, created_at")
        .single();

      if (upErr) setError(upErr.message);
      else if (updated) {
        const row = updated as MessageRow;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === row.id
              ? { ...m, ...row, is_edited: row.is_edited ?? true }
              : m
          )
        );
        setDraft("");
        setEditingMessageId(null);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
      setSending(false);
      return;
    }

    if (!content) return;
    setSending(true);
    setError(null);
    const replyId = replyingTo?.id ?? null;
    const { data: inserted, error: insErr } = await supabase
      .from("messages")
      .insert({
        room_id: ROOM_ID,
        sender_name: trimmedName,
        content,
        image_url: null,
        reply_to_id: replyId,
        is_edited: false,
      })
      .select("id, room_id, sender_name, content, image_url, reply_to_id, is_edited, created_at")
      .single();

    if (insErr) setError(insErr.message);
    else if (inserted) {
      stickToBottomRef.current = true;
      const row = inserted as MessageRow;
      setMessages((prev) =>
        prev.some((m) => m.id === row.id)
          ? prev
          : [...prev, { ...row, is_edited: row.is_edited ?? false }].sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime()
            )
      );
      setDraft("");
      setReplyingTo(null);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
    setSending(false);
  }, [
    supabase,
    canSend,
    draft,
    trimmedName,
    replyingTo,
    editingMessageId,
    messages,
  ]);

  const deleteMessage = useCallback(async (id: string) => {
    if (!supabase) return;
    if (!window.confirm("Supprimer ce message ?")) return;
    setError(null);
    const { error: delErr } = await supabase.from("messages").delete().eq("id", id);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    const wasEditing = editingMessageIdRef.current === id;
    setMessages((prev) => prev.filter((m) => m.id !== id));
    setOpenMessageMenuId(null);
    setEditingMessageId((eid) => (eid === id ? null : eid));
    if (wasEditing) setDraft("");
  }, [supabase]);

  const sendImageMessage = useCallback(
    async (file: File) => {
      if (!supabase || !hasUsername || configError) return;
      if (!file.type.startsWith("image/")) {
        setError("Veuillez choisir un fichier image.");
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError("Image trop volumineuse (5 Mo maximum).");
        return;
      }

      setUploadingImage(true);
      setError(null);

      const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase();
      const ext = /^[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : "jpg";
      const path = `${ROOM_ID}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(CHAT_ATTACHMENTS_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });

      if (upErr) {
        setError(upErr.message);
        setUploadingImage(false);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(CHAT_ATTACHMENTS_BUCKET).getPublicUrl(path);

      const caption = draft.trim();

      const { data: inserted, error: insErr } = await supabase
        .from("messages")
        .insert({
          room_id: ROOM_ID,
          sender_name: trimmedName,
          content: caption,
          image_url: publicUrl,
          reply_to_id: replyingTo?.id ?? null,
          is_edited: false,
        })
        .select("id, room_id, sender_name, content, image_url, reply_to_id, is_edited, created_at")
        .single();

      if (insErr) setError(insErr.message);
      else if (inserted) {
        stickToBottomRef.current = true;
        const row = inserted as MessageRow;
        setMessages((prev) =>
          prev.some((m) => m.id === row.id)
            ? prev
            : [
                ...prev,
                { ...row, is_edited: row.is_edited ?? false },
              ].sort(
                (a, b) =>
                  new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime()
              )
        );
        setDraft("");
        setReplyingTo(null);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
      setUploadingImage(false);
    },
    [supabase, hasUsername, configError, draft, trimmedName, replyingTo]
  );

  const onImageInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) void sendImageMessage(file);
    },
    [sendImageMessage]
  );

  const applyMention = useCallback((name: string) => {
    const ta = textareaRef.current;
    const cursor = ta?.selectionStart ?? draft.length;
    const ctx = getMentionContext(draft, cursor);
    if (!ctx) return;
    const before = draft.slice(0, ctx.atIndex);
    const after = draft.slice(cursor);
    const newDraft = `${before}@${name} ${after}`;
    setDraft(newDraft);
    const newPos = before.length + name.length + 2;
    requestAnimationFrame(() => {
      ta?.setSelectionRange(newPos, newPos);
      setSelectionStart(newPos);
    });
  }, [draft]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;
      const cursor = ta.selectionStart;
      const ctx = getMentionContext(draft, cursor);
      const cands = ctx
        ? filterMentionCandidates(participantNames, ctx.query)
        : [];

      if (cands.length > 0 && ctx) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          mentionIdxRef.current = Math.min(
            mentionIdxRef.current + 1,
            cands.length - 1
          );
          setMentionHighlightIdx(mentionIdxRef.current);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          mentionIdxRef.current = Math.max(mentionIdxRef.current - 1, 0);
          setMentionHighlightIdx(mentionIdxRef.current);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          const before = draft.slice(0, ctx.atIndex);
          const after = draft.slice(cursor);
          setDraft(before + after);
          mentionIdxRef.current = 0;
          setMentionHighlightIdx(0);
          requestAnimationFrame(() => {
            const pos = ctx.atIndex;
            ta.setSelectionRange(pos, pos);
            setSelectionStart(pos);
          });
          return;
        }
        if (
          (e.key === "Enter" || e.key === "Tab") &&
          !e.shiftKey
        ) {
          e.preventDefault();
          const safe = Math.min(
            mentionIdxRef.current,
            Math.max(0, cands.length - 1)
          );
          const pick = cands[safe] ?? cands[0];
          if (pick) applyMention(pick);
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void sendMessage();
      }
    },
    [draft, participantNames, applyMention, sendMessage]
  );

  const effectiveError = configError ?? error;
  const effectiveLoading = configError ? false : loading;

  const desktopFooterPadBottom = `calc(max(0.75rem, env(safe-area-inset-bottom)) + ${keyboardInsetPx}px)`;

  const ChatPanel = (
    <div
      className={cn(
        "flex min-h-0 flex-col",
        variant === "page"
          ? "relative isolate z-0 flex h-full min-h-0 w-full flex-1 flex-col bg-white"
          : "h-full bg-background"
      )}
    >
      {variant === "page" ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-white"
        />
      ) : null}
      <header
        className={cn(
          "flex shrink-0 items-start gap-2 py-3",
          variant === "page"
            ? "border-0 px-2 pt-[max(0.75rem,env(safe-area-inset-top))]"
            : "justify-between border-b border-border px-4"
        )}
      >
        {variant === "page" ? (
          <Link
            href="/planning"
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted"
            aria-label="Retour au planning"
          >
            <ArrowLeft className="size-5" />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-sm font-semibold tracking-tight">Messages équipe</h2>
          {hasUsername && !editingName ? (
            <>
              <p className="text-xs text-muted-foreground">
                Prénom :{" "}
                <span className="font-medium text-foreground">{trimmedName}</span>{" "}
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    setEditingName(true);
                  }}
                >
                  Changer de profil
                </button>
                <span className="text-muted-foreground"> · </span>
                <button
                  type="button"
                  className="text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
                  onClick={disconnectProfile}
                >
                  Se déconnecter
                </button>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  disabled={
                    chatPushStatus === "loading" ||
                    chatPushStatus === "subscribed"
                  }
                  onClick={() => void onEnableChatPush()}
                >
                  {chatPushStatus === "loading" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Bell className="size-3.5" />
                  )}
                  {chatPushStatus === "subscribed"
                    ? "Alertes actives"
                    : "Activer les alertes"}
                </Button>
                {chatPushOfflineHint ? (
                  <p className="text-xs text-muted-foreground">Mode hors-ligne</p>
                ) : chatPushMessage ? (
                  <p className="text-xs text-destructive" role="alert">
                    {chatPushMessage}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
          {hasUsername && editingName ? (
            <div className="flex flex-col gap-2 pt-1">
              <Label htmlFor={`chat-edit-name-${variant}`} className="text-xs">
                Prénom
              </Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id={`chat-edit-name-${variant}`}
                  value={usernameStore.value}
                  onChange={(e) => persistUsername(e.target.value)}
                  maxLength={120}
                  autoComplete="nickname"
                  className="h-8 max-w-[220px] text-sm"
                  onFocus={(e) => scrollIntoViewOnMobileFocus(e.currentTarget)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (usernameStore.value.trim().length < 1) {
                      return;
                    }
                    setEditingName(false);
                  }}
                >
                  OK
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {!hasUsername ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 py-10">
          <div className="w-full max-w-sm space-y-4 text-center">
            <p className="text-sm font-medium text-foreground">
              Entrez votre prénom pour commencer à discuter
            </p>
            <div className="space-y-2 text-left">
              <Label htmlFor={`chat-onboarding-${variant}`}>Prénom</Label>
              <Input
                id={`chat-onboarding-${variant}`}
                value={onboardingDraft}
                onChange={(e) => {
                  setOnboardingDraft(e.target.value);
                  setOnboardingError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveOnboardingName();
                  }
                }}
                placeholder="ex. Marie"
                maxLength={120}
                autoComplete="nickname"
                autoFocus
                className="h-10"
                onFocus={(e) => scrollIntoViewOnMobileFocus(e.currentTarget)}
              />
              {onboardingError ? (
                <p className="text-xs text-destructive" role="alert">
                  {onboardingError}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={saveOnboardingName}
            >
              Enregistrer
            </Button>
          </div>
          {effectiveError ? (
            <p
              className="max-w-sm rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-center text-xs text-destructive"
              role="alert"
            >
              {effectiveError}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <InvisibleCloseLayer
            scrollRef={scrollRef}
            enabled={variant === "page"}
            onActivate={() => {
              textareaRef.current?.blur();
            }}
            onScroll={variant === "page" ? handleMessagesScroll : undefined}
            className={cn(
              "min-h-0 w-full max-w-full flex-1 space-y-4 overflow-y-auto overscroll-y-contain sm:px-4",
              variant === "page"
                ? "touch-pan-y px-0 py-2"
                : "px-3 py-3"
            )}
            style={
              variant === "page" && hasUsername
                ? {
                    minHeight: 0,
                    ...(messagesMaxHeightPx != null
                      ? {
                          height: `${messagesMaxHeightPx}px`,
                          maxHeight: `${messagesMaxHeightPx}px`,
                        }
                      : {}),
                    paddingBottom:
                      keyboardInsetPx > 0
                        ? "max(0.75rem, env(safe-area-inset-bottom))"
                        : "0.5rem",
                  }
                : undefined
            }
          >
            {effectiveLoading ? (
              <p className="text-center text-sm text-muted-foreground">
                Chargement…
              </p>
            ) : null}
            {effectiveError && !effectiveLoading ? (
              <p
                className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                role="alert"
              >
                {effectiveError}
              </p>
            ) : null}
            {!effectiveLoading && !messages.length && !effectiveError ? (
              <p className="text-center text-sm text-muted-foreground">
                Aucun message pour l’instant. Dites bonjour à l’équipe.
              </p>
            ) : null}
            {messages.map((m) => {
              const currentUsername = trimmedName;
              const isMe = m.sender_name === currentUsername;
              const parent = m.reply_to_id
                ? messages.find((p) => p.id === m.reply_to_id)
                : undefined;
              return (
                <div
                  key={m.id}
                  className={cn(
                    "group flex w-full max-w-full min-w-0 gap-2",
                    isMe
                      ? "flex-row justify-end items-end"
                      : "flex-row justify-start items-start"
                  )}
                >
                  <div className="min-w-0 max-w-[min(85%,20rem)] shrink sm:max-w-[22rem]">
                    <div
                      className={cn(
                        "px-3.5 py-2 text-sm leading-snug shadow-sm",
                        isMe
                          ? "rounded-[1.35rem] rounded-br-md bg-zinc-800 text-white"
                          : "rounded-[1.35rem] rounded-bl-md bg-zinc-100 text-zinc-900"
                      )}
                    >
                      {parent ? (
                        <div
                          className={cn(
                            "mb-2 rounded-lg border-l-[3px] py-1.5 pl-2 pr-1",
                            isMe
                              ? "border-white/35 bg-white/10"
                              : "border-zinc-400/80 bg-white/90"
                          )}
                        >
                          <p
                            className={cn(
                              "text-[11px] font-semibold leading-tight",
                              isMe ? "text-white" : "text-zinc-900"
                            )}
                          >
                            {parent.sender_name}
                          </p>
                          <p
                            className={cn(
                              "truncate text-[11px]",
                              isMe ? "text-white/80" : "text-zinc-600"
                            )}
                          >
                            {replySnippet(parent)}
                          </p>
                        </div>
                      ) : m.reply_to_id ? (
                        <div
                          className={cn(
                            "mb-2 rounded-lg border-l-[3px] py-1.5 pl-2 text-[11px]",
                            isMe
                              ? "border-white/30 text-white/75"
                              : "border-zinc-400 text-zinc-600"
                          )}
                        >
                          Message indisponible
                        </div>
                      ) : null}
                      {!isMe ? (
                        <p className="mb-1 text-xs font-semibold text-zinc-700">
                          {m.sender_name}
                        </p>
                      ) : null}
                      {m.image_url?.trim() ? (
                        <a
                          href={m.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "mb-1 block overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                            isMe
                              ? "focus-visible:ring-white/60"
                              : "focus-visible:ring-zinc-400"
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={m.image_url}
                            alt=""
                            className="max-h-64 w-full object-contain"
                            loading="lazy"
                          />
                        </a>
                      ) : null}
                      {(m.content || "").trim() ? (
                        <MessageContentWithMentions
                          text={m.content}
                          mentionNames={participantNames}
                          mine={isMe}
                        />
                      ) : null}
                      <p
                        className={cn(
                          "mt-1.5 text-[10px] tabular-nums",
                          isMe
                            ? "text-right text-white/70"
                            : "text-left text-zinc-500"
                        )}
                      >
                        {isMe ? (
                          <>
                            <span className="font-medium text-white/85">
                              Vous
                            </span>
                            {" · "}
                          </>
                        ) : null}
                        {formatTime(m.created_at)}
                        {m.is_edited ? (
                          <span
                            className={cn(
                              "ml-1.5 italic",
                              isMe ? "text-white/55" : "text-zinc-400"
                            )}
                          >
                            (modifié)
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-end gap-0.5">
                    {isMe ? (
                      <div
                        className="relative"
                        data-slot="message-actions"
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-zinc-500 opacity-100 hover:bg-zinc-200/80 hover:text-zinc-900 md:opacity-0 md:group-hover:opacity-100 dark:hover:bg-zinc-700/80 dark:hover:text-zinc-100"
                          aria-label="Actions message"
                          aria-expanded={openMessageMenuId === m.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMessageMenuId((id) =>
                              id === m.id ? null : m.id
                            );
                          }}
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                        {openMessageMenuId === m.id ? (
                          <div
                            className="absolute bottom-full right-0 z-50 mb-1 min-w-[10rem] overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-600 dark:bg-zinc-900"
                            data-slot="message-actions"
                            role="menu"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
                              onClick={() => {
                                setOpenMessageMenuId(null);
                                setEditingMessageId(m.id);
                                setDraft(m.content);
                                setReplyingTo(null);
                                requestAnimationFrame(() =>
                                  textareaRef.current?.focus()
                                );
                              }}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                              onClick={() => void deleteMessage(m.id)}
                            >
                              <Trash2 className="size-4 shrink-0" />
                              Supprimer
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label="Répondre"
                      onClick={() => {
                        setReplyingTo(m);
                        requestAnimationFrame(() =>
                          textareaRef.current?.focus()
                        );
                      }}
                    >
                      <Reply className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            <div
              ref={messagesEndRef}
              className="h-0 w-full shrink-0"
              aria-hidden
            />
          </InvisibleCloseLayer>

          <footer
            ref={composerRef}
            className={cn(
              "z-30 shrink-0 bg-white",
              variant === "page"
                ? "sticky bottom-0 left-0 right-0 w-full border-0 px-0 pt-0 shadow-none"
                : "relative border-t border-border bg-background px-3 pt-3"
            )}
            style={
              variant === "page"
                ? {
                    bottom: keyboardInsetPx,
                    paddingBottom:
                      keyboardInsetPx > 0
                        ? 0
                        : "env(safe-area-inset-bottom)",
                  }
                : { paddingBottom: desktopFooterPadBottom }
            }
          >
            {editingMessageId ? (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800/50">
                <p className="min-w-0 flex-1 text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  Modification du message
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
                  onClick={() => {
                    setEditingMessageId(null);
                    setDraft("");
                  }}
                >
                  Annuler
                </Button>
              </div>
            ) : null}
            {!editingMessageId && replyingTo ? (
              <div className="mb-2 flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1 border-l-2 border-zinc-400 pl-2 dark:border-zinc-500">
                  <p className="text-xs font-semibold text-foreground">
                    Réponse à {replyingTo.sender_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {replySnippet(replyingTo)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  aria-label="Annuler la réponse"
                  onClick={() => setReplyingTo(null)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : null}
            {mentionCtx && mentionCandidates.length > 0 ? (
              <ul
                className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-36 overflow-y-auto rounded-lg border border-border bg-popover px-1 py-1 text-sm shadow-md"
                role="listbox"
                aria-label="Mentions"
              >
                {mentionCandidates.map((name, idx) => (
                  <li key={name}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={idx === mentionHighlightSafe}
                      className={cn(
                        "flex w-full rounded-md px-2 py-1.5 text-left text-foreground",
                        idx === mentionHighlightSafe
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted"
                      )}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyMention(name)}
                    >
                      @{name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div
              className={cn(
                "flex w-full items-center justify-center",
                variant === "page" ? "px-4 pb-1" : "px-0"
              )}
            >
              <div
                className={cn(
                  "flex min-w-0 items-center gap-3",
                  variant === "page"
                    ? "mx-auto w-full max-w-2xl rounded-full bg-muted/50 px-4 py-2.5 shadow-sm"
                    : "w-full rounded-2xl border border-border/70 bg-muted/40 px-3 py-1.5"
                )}
              >
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={onImageInputChange}
                />
                <Button
                  type="button"
                  variant={variant === "page" ? "ghost" : "outline"}
                  size="icon"
                  className={cn(
                    "h-10 w-10 shrink-0",
                    variant === "page"
                      ? "rounded-full text-muted-foreground hover:bg-white/80"
                      : "rounded-xl"
                  )}
                  disabled={!canAttach}
                  onClick={() => imageInputRef.current?.click()}
                  aria-label="Joindre une image"
                >
                  {uploadingImage ? (
                    <span className="size-4 animate-pulse rounded-full bg-primary" />
                  ) : (
                    <Paperclip className="size-5" />
                  )}
                </Button>
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => {
                    const v = e.target.value;
                    const pos = e.target.selectionStart;
                    const ctx = getMentionContext(v, pos);
                    if (ctx?.atIndex !== lastMentionAtRef.current) {
                      mentionIdxRef.current = 0;
                      setMentionHighlightIdx(0);
                    }
                    lastMentionAtRef.current = ctx?.atIndex ?? null;
                    setDraft(v);
                    setSelectionStart(pos);
                    const cands = ctx
                      ? filterMentionCandidates(participantNames, ctx.query)
                      : [];
                    const max = Math.max(0, cands.length - 1);
                    if (mentionIdxRef.current > max) {
                      mentionIdxRef.current = max;
                      setMentionHighlightIdx(max);
                    }
                  }}
                  onKeyDown={onKeyDown}
                  onSelect={(e) =>
                    setSelectionStart(e.currentTarget.selectionStart)
                  }
                  onClick={(e) =>
                    setSelectionStart(e.currentTarget.selectionStart)
                  }
                  onFocus={(e) => {
                    if (variant === "page") {
                      handleTextareaFocus();
                    } else {
                      scrollIntoViewOnMobileFocus(e.currentTarget);
                    }
                  }}
                  placeholder={
                    editingMessageId
                      ? "Modifier le message…"
                      : "Message… (Entrée pour envoyer)"
                  }
                  disabled={!hasUsername || !supabase || uploadingImage}
                  rows={2}
                  maxLength={2000}
                  autoComplete="off"
                  data-lpignore="true"
                  className={cn(
                    "min-h-[44px] flex-1 resize-none bg-transparent leading-snug",
                    "border-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                    "placeholder:text-muted-foreground",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    variant === "page"
                      ? "px-3 py-2 text-[16px]"
                      : "px-2 py-2 text-sm"
                  )}
                />
                <Button
                  type="button"
                  size="icon"
                  className={cn(
                    "h-10 w-10 shrink-0",
                    variant === "page" ? "rounded-full" : "rounded-xl"
                  )}
                  disabled={!canSend}
                  onClick={() => void sendMessage()}
                  aria-label="Envoyer"
                >
                  {sending ? (
                    <span className="size-4 animate-pulse rounded-full bg-primary-foreground/80" />
                  ) : (
                    <Send className="size-5" />
                  )}
                </Button>
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  );

  if (variant === "desktop") {
    if (!isMounted) return null;
    return (
      <section className="h-full w-full">
        <div className="h-full">{ChatPanel}</div>
      </section>
    );
  }

  if (!isMounted) return null;

  return (
    <section className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {ChatPanel}
    </section>
  );
}
