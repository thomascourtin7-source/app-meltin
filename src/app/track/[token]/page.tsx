"use client";

import { Loader2, Phone, Plane, UserRound } from "lucide-react";
import { useParams } from "next/navigation";

import { ClientDoChatPanel } from "@/components/client-chat/client-do-chat-panel";
import { MissionTimeline } from "@/components/client-chat/mission-timeline";
import {
  assignedAgentCountFromFormatted,
  greeterCardTitle,
  parseFormattedAgentNames,
} from "@/lib/client-chat/assigned-agents";
import {
  formatPhoneForDisplay,
  lookupAgentPhone,
} from "@/lib/client-chat/agent-phones";
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

function GreeterAgentsList({ agentNameFormatted }: { agentNameFormatted: string | null }) {
  const agents = parseFormattedAgentNames(agentNameFormatted);

  if (agents.length === 0) {
    return (
      <p className="mt-1 text-xl font-semibold text-white">
        Assignment in progress
      </p>
    );
  }

  return (
    <ul className="mt-2 space-y-2.5">
      {agents.map((name) => {
        const phone = lookupAgentPhone(name);
        return (
          <li
            key={name}
            className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3"
          >
            <span className="text-lg font-semibold text-white">{name}</span>
            {phone ? (
              <a
                href={`tel:${phone}`}
                className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-3 py-1 text-sm font-medium text-[#f5e6b8]/90 transition-colors hover:border-[#D4AF37]/55 hover:bg-[#D4AF37]/20 active:scale-[0.98]"
              >
                <Phone className="size-3.5 shrink-0 text-[#D4AF37]" aria-hidden />
                {formatPhoneForDisplay(phone)}
              </a>
            ) : (
              <span className="text-sm text-white/40">Phone unavailable</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function TrackMissionPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";
  const { payload, timeline, loading, error } = useTrackMissionLive(token);
  const agentCount = assignedAgentCountFromFormatted(payload?.agentName ?? null);
  const isMissionCompleted =
    payload?.statusTone === "done" ||
    Boolean(payload?.timeline?.completedAt?.trim());
  const reportPdfUrl =
    isMissionCompleted && token.trim()
      ? `/api/track/${encodeURIComponent(token.trim())}/report-pdf`
      : null;

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
        {payload.flightNumbers ? (
          <p className="mt-1.5 text-sm font-medium tracking-[0.12em] text-white/55">
            Flight{" "}
            <span className="text-[#f5e6b8]/85">{payload.flightNumbers}</span>
          </p>
        ) : null}
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
              {greeterCardTitle(agentCount)}
            </p>
            <GreeterAgentsList agentNameFormatted={payload.agentName} />
            {!isMissionCompleted ? (
              <p className="mt-3 text-sm text-white/55">
                Chat live with your Meltin team below.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <MissionTimeline
        events={timeline}
        reportPdfUrl={reportPdfUrl}
        className="mb-6"
      />

      {!isMissionCompleted ? (
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
      ) : null}

      <footer className="mt-8 text-center text-xs text-white/35">
        Meltin — premium airport assistance
      </footer>
    </div>
  );
}
