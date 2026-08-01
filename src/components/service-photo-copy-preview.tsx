"use client";

import { useCallback, useEffect, useState } from "react";

import { copyImageUrlToClipboard } from "@/lib/client-chat/copy-image-to-clipboard";
import { cn } from "@/lib/utils";

type CopyToast = {
  message: string;
  tone: "success" | "error";
};

type ServicePhotoCopyPreviewProps = {
  src: string;
  alt?: string;
  imageClassName?: string;
  buttonClassName?: string;
  hintText?: string;
  successMessage?: string;
  showHoverHint?: boolean;
};

export function ServicePhotoCopyPreview({
  src,
  alt = "Service photo preview",
  imageClassName,
  buttonClassName,
  hintText = "Cliquer pour copier la photo",
  successMessage = "Photo copiée dans le presse-papiers !",
  showHoverHint = true,
}: ServicePhotoCopyPreviewProps) {
  const [copyToast, setCopyToast] = useState<CopyToast | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!copyToast) return;
    const timer = window.setTimeout(() => setCopyToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [copyToast]);

  const handleCopy = useCallback(async () => {
    if (copying) return;
    setCopying(true);
    try {
      await copyImageUrlToClipboard(src);
      setCopyToast({ message: successMessage, tone: "success" });
    } catch (e) {
      setCopyToast({
        message:
          e instanceof Error
            ? e.message
            : "Impossible de copier la photo.",
        tone: "error",
      });
    } finally {
      setCopying(false);
    }
  }, [copying, src, successMessage]);

  return (
    <>
      <button
        type="button"
        title={hintText}
        aria-label={hintText}
        disabled={copying}
        onClick={() => void handleCopy()}
        className={cn(
          "group relative cursor-pointer overflow-hidden transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 disabled:cursor-wait disabled:opacity-70",
          buttonClassName
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className={cn("pointer-events-none", imageClassName)}
          loading="lazy"
          decoding="async"
        />
        {showHoverHint ? (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 py-1 text-left text-[9px] font-medium leading-tight text-white/90 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
            {hintText}
          </span>
        ) : null}
      </button>

      {copyToast ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed bottom-6 left-1/2 z-[60] max-w-[min(90vw,22rem)] -translate-x-1/2 rounded-full border px-4 py-2.5 text-center text-sm font-medium shadow-xl backdrop-blur-sm",
            copyToast.tone === "success"
              ? "border-emerald-400/40 bg-emerald-950/90 text-emerald-100"
              : "border-red-400/40 bg-red-950/90 text-red-100"
          )}
        >
          {copyToast.message}
        </div>
      ) : null}
    </>
  );
}
