"use client";

import { Loader2, Plane, UserRound } from "lucide-react";
import { useParams } from "next/navigation";

import { ClientDoChatPanel } from "@/components/client-chat/client-do-chat-panel";
import { MissionTimeline } from "@/components/client-chat/mission-timeline";
import { useTrackMissionLive } from "@/lib/client-chat/use-track-mission-live";
import { cn } from "@/lib/utils";
import type { TrackServicePayload } from "@/lib/client-chat/types";

function statusBadgeClass(
  tone: TrackServicePayload["statusTone"]
): string {
  switch (tone) {
    case "done":
      return "border-emerald-400/40 bg-emerald-500/15 text-emerald-200";
    case "active":
      return "border-amber-400/40 bg-amber-500/15 text-amber-100";
    case "alert":
      return "border-red-400/40 bg-red-500/15 text-red-100";
    default:
      return "border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#f5e6b8]";
  }
}

export default function TrackMissionPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";
  const { payload, timeline, loading, error } = useTrackMissionLive(token);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 text-white/70">
        <Loader2 className="size-8 animate-spin text-[#D4AF37]" aria-hidden />
        <p className="text-sm">Loading mission tracking…</p>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <Plane className="mb-4 size-10 text-[#D4AF37]/80" aria-hidden />
        <h1 className="text-xl font-semibold">Tracking unavailable</h1>
        <p className="mt-2 text-sm text-white/60">
          {error ?? "This tracking link is no longer valid."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col px-4 py-8 sm:py-12">
      <header className="mb-8 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/5 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-[#D4AF37]">
          <Plane className="size-3.5" aria-hidden />
          MELTIN · VIP TRACKING
        </div>
        <h1 className="text-balance text-2xl font-semibold leading-tight sm:text-3xl">
          Live Mission Tracking
        </h1>
        <p className="mt-2 text-lg text-[#f5e6b8]/90">{payload.passengerLabel}</p>
        <div className="mt-4 flex justify-center">
          <span
            className={cn(
              "inline-flex rounded-full border px-4 py-1 text-sm font-medium",
              statusBadgeClass(payload.statusTone)
            )}
          >
            {payload.status}
          </span>
        </div>
      </header>

      <section className="mb-6 rounded-2xl border border-white/10 bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-5 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10">
            <UserRound className="size-6 text-[#D4AF37]" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-white/50">
              Your Greeter
            </p>
            <p className="mt-1 text-xl font-semibold text-white">
              {payload.agentName ?? "Assignment in progress"}
            </p>
            <p className="mt-2 text-sm text-white/55">
              Chat live with your Meltin team below.
            </p>
          </div>
        </div>
      </section>

      <MissionTimeline events={timeline} className="mb-6" />

      <section className="flex flex-1 flex-col">
        <ClientDoChatPanel
          mode="public"
          locale="en"
          shareToken={token}
          spreadsheetId={payload.spreadsheetId}
          serviceId={payload.serviceId}
          className="border-white/10 bg-[#0b1220]/90 text-white [&_textarea]:border-white/15 [&_textarea]:bg-white/5 [&_textarea]:text-white [&_textarea]:placeholder:text-white/40"
        />
      </section>

      <footer className="mt-8 text-center text-xs text-white/35">
        Meltin — premium airport assistance
      </footer>
    </div>
  );
}
