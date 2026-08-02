"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Link2, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDoLinkAccess } from "@/lib/client-chat/use-do-link-access";
import { buildWhatsAppShareUrl } from "@/lib/client-chat/share-token";
import { readPlanningAuthSession } from "@/lib/auth/planning-auth-session";
import { cn } from "@/lib/utils";

type DoShareLinkButtonProps = {
  spreadsheetId: string;
  serviceId: string;
  passengerLabel: string;
  flightNumbers?: string;
  className?: string;
  variant?: "planning" | "report";
  onTrackingActivated?: () => void;
};

export function DoShareLinkButton({
  spreadsheetId,
  serviceId,
  passengerLabel,
  flightNumbers,
  className,
  variant = "planning",
  onTrackingActivated,
}: DoShareLinkButtonProps) {
  const canShare = useDoLinkAccess();
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const ensureLink = useCallback(async (): Promise<string | null> => {
    if (trackUrl) return trackUrl;
    const session = readPlanningAuthSession();
    if (!session?.token) {
      window.alert("Connectez-vous pour générer le lien.");
      return null;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/client-chat/share-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          spreadsheetId,
          serviceId,
          passengerLabel,
          flightNumbers: flightNumbers?.trim() || undefined,
        }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        const msg =
          json &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : "Génération du lien impossible.";
        throw new Error(msg);
      }
      const url =
        json &&
        typeof json === "object" &&
        typeof (json as { trackUrl?: unknown }).trackUrl === "string"
          ? (json as { trackUrl: string }).trackUrl
          : "";
      if (!url) throw new Error("Réponse invalide.");
      setTrackUrl(url);
      onTrackingActivated?.();
      return url;
    } finally {
      setLoading(false);
    }
  }, [
    trackUrl,
    spreadsheetId,
    serviceId,
    passengerLabel,
    flightNumbers,
    onTrackingActivated,
  ]);

  const copyLink = async () => {
    const url = await ensureLink();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copiez le lien de suivi :", url);
    }
  };

  const shareWhatsApp = async () => {
    const url = await ensureLink();
    if (!url) return;
    window.open(
      buildWhatsAppShareUrl(url, passengerLabel),
      "_blank",
      "noopener,noreferrer"
    );
  };

  if (!canShare) return null;

  const isPlanning = variant === "planning";

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => void copyLink()}
        className={cn(
          isPlanning &&
            "border-[#D4AF37]/50 bg-transparent text-[#D4AF37] hover:bg-[#D4AF37]/10"
        )}
      >
        {copied ? (
          <Check className="mr-1.5 size-3.5" />
        ) : (
          <Link2 className="mr-1.5 size-3.5" />
        )}
        {copied ? "Copié !" : "Lien Donneur d'Ordre"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => void shareWhatsApp()}
        className={cn(
          isPlanning &&
            "border-emerald-500/40 bg-transparent text-emerald-300 hover:bg-emerald-500/10"
        )}
      >
        <MessageCircle className="mr-1.5 size-3.5" />
        WhatsApp
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={loading}
        onClick={() => void copyLink()}
        className="hidden sm:inline-flex"
        title="Copier le lien"
      >
        <Copy className="size-3.5" />
      </Button>
    </div>
  );
}
