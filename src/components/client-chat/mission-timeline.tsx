"use client";

import { useState } from "react";
import {
  Camera,
  CheckCircle2,
  Circle,
  MapPin,
  UserCheck,
  UserRound,
} from "lucide-react";

import type { TrackTimelineEvent } from "@/lib/client-chat/track-timeline";
import { cn } from "@/lib/utils";

type MissionTimelineProps = {
  events: TrackTimelineEvent[];
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
    default:
      return Circle;
  }
}

export function MissionTimeline({ events, className }: MissionTimelineProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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
                      <p className="text-sm font-medium text-white/95">
                        {event.title}
                      </p>
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
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(event.photoUrl!)}
                        className="mt-3 block overflow-hidden rounded-xl border border-white/10 transition hover:border-[#D4AF37]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={event.photoUrl}
                          alt="Service photo confirmation"
                          className="max-h-48 w-full object-cover"
                        />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Service photo"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full border border-white/20 px-3 py-1 text-sm text-white/80 hover:bg-white/10"
            onClick={() => setLightboxUrl(null)}
          >
            Close
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Service photo confirmation"
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
