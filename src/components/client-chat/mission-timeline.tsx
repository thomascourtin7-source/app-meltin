"use client";

import { useState } from "react";
import {
  Camera,
  CheckCircle2,
  Circle,
  FileText,
  MapPin,
  UserCheck,
  UserRound,
} from "lucide-react";

import { ServicePhotoCopyPreview } from "@/components/service-photo-copy-preview";
import type { TrackTimelineEvent } from "@/lib/client-chat/track-timeline";
import type { TrackMissionReportSummary } from "@/lib/client-chat/track-report-summary";
import { cn } from "@/lib/utils";

type MissionTimelineProps = {
  events: TrackTimelineEvent[];
  missionReport?: TrackMissionReportSummary | null;
  className?: string;
};

function formatEventTime(iso: string | null): string {
  if (!iso?.trim()) return "";
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function eventIcon(kind: TrackTimelineEvent["kind"]) {
  switch (kind) {
    case "assigned":
      return UserRound;
    case "on_position":
      return MapPin;
    case "passenger_met":
      return UserCheck;
    case "photo":
      return Camera;
    case "completed":
      return CheckCircle2;
    case "mission_report":
      return FileText;
    default:
      return Circle;
  }
}

const REPORT_KIND_LABEL: Record<
  TrackMissionReportSummary["reportKind"],
  string
> = {
  arrival: "Arrival Report",
  departure: "Departure Report",
  transit: "Transit Report",
};

export function MissionTimeline({
  events,
  missionReport,
  className,
}: MissionTimelineProps) {
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          "rounded-2xl border border-white/10 bg-[#0b1220]/90 p-5 shadow-xl",
          className
        )}
      >
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#D4AF37]/90">
          Live Status &amp; Timeline
        </h2>

        {events.length === 0 ? (
          <p className="py-4 text-center text-sm text-white/45">
            Waiting for live mission updates…
          </p>
        ) : (
          <ol className="space-y-0">
            {events.map((event, index) => {
              const Icon = eventIcon(event.kind);
              const isLast = index === events.length - 1;
              const time = formatEventTime(event.at);
              const isReportLink = event.kind === "mission_report";

              return (
                <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
                  {!isLast ? (
                    <span
                      className="absolute left-[15px] top-8 h-[calc(100%-8px)] w-px bg-gradient-to-b from-[#D4AF37]/50 to-white/10"
                      aria-hidden
                    />
                  ) : null}

                  <div className="relative z-[1] flex size-8 shrink-0 items-center justify-center rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/10">
                    <Icon className="size-4 text-[#D4AF37]" aria-hidden />
                  </div>

                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {isReportLink && missionReport ? (
                        <button
                          type="button"
                          onClick={() => setReportOpen(true)}
                          className="text-left text-sm font-medium text-[#D4AF37] underline decoration-[#D4AF37]/40 underline-offset-2 transition hover:text-[#f5e6b8] hover:decoration-[#D4AF37]"
                        >
                          {event.title}
                        </button>
                      ) : (
                        <p className="text-sm font-medium text-white/95">
                          {event.title}
                        </p>
                      )}
                      {time ? (
                        <time
                          className="text-xs tabular-nums text-[#D4AF37]/80"
                          dateTime={event.at ?? undefined}
                        >
                          {time}
                        </time>
                      ) : null}
                    </div>

                    {event.kind === "photo" && event.photoUrl ? (
                      <ServicePhotoCopyPreview
                        src={event.photoUrl}
                        alt="Service photo confirmation"
                        hintText="Click to copy photo"
                        successMessage="Photo copied to clipboard!"
                        buttonClassName="mt-3 w-full rounded-xl border border-white/10 hover:border-[#D4AF37]/40"
                        imageClassName="max-h-48 w-full object-cover"
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {reportOpen && missionReport ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mission-report-title"
          onClick={() => setReportOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#D4AF37]/80">
                  Mission Report
                </p>
                <h3
                  id="mission-report-title"
                  className="mt-1 text-lg font-semibold text-white"
                >
                  {REPORT_KIND_LABEL[missionReport.reportKind]}
                </h3>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-full border border-white/20 px-3 py-1 text-sm text-white/80 hover:bg-white/10"
                onClick={() => setReportOpen(false)}
              >
                Close
              </button>
            </div>

            <dl className="space-y-3">
              {missionReport.fields.map((field) => (
                <div
                  key={field.label}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#D4AF37]/70">
                    {field.label}
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-white/90">
                    {field.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </>
  );
}
