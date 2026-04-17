"use client";

import { useEffect } from "react";

import { ensureServiceWorkerRegistered } from "@/lib/push/register-sw";

/**
 * Enregistre tôt le Service Worker (`/sw.js`) pour que l’abonnement push
 * (après « S'enregistrer » ou le chat) soit prêt sans attendre une autre vue.
 */
export function PlanningPushBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    void ensureServiceWorkerRegistered();
  }, []);

  return null;
}
