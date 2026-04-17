"use client";

import dynamic from "next/dynamic";

import { ConfigurationForm } from "@/components/configuration/configuration-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PushNotificationCard = dynamic(
  () =>
    import("@/components/push/push-notification-card").then((m) => ({
      default: m.PushNotificationCard,
    })),
  { ssr: false, loading: () => null }
);

export function ConfigurationClient() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 pb-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Liez votre Google Sheet et activez les notifications lorsque vous serez
          prêt.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Google Sheet</CardTitle>
          <CardDescription>
            L’ID se trouve dans l’URL du tableur :{" "}
            <span className="font-mono text-foreground">
              docs.google.com/spreadsheets/d/
              <strong>[ID]</strong>/edit
            </span>
            . Le tableur doit être lisible par « Tous les utilisateurs disposant
            du lien » (lecture). Définissez{" "}
            <span className="font-mono">NEXT_PUBLIC_GOOGLE_SHEETS_API_KEY</span>{" "}
            dans votre environnement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConfigurationForm />
        </CardContent>
      </Card>

      <PushNotificationCard />
    </div>
  );
}
