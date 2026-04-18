"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { ChatProfileSettings } from "@/components/configuration/chat-profile-settings";
import { usePlanningPreparation } from "@/components/planning/planning-preparation-context";
import { Button } from "@/components/ui/button";
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
  const router = useRouter();
  const { setPreparingTomorrow } = usePlanningPreparation();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 pb-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Profil, préparation du planning de demain et notifications.
        </p>
      </div>

      <ChatProfileSettings />

      <Card className="rounded-xl border shadow-sm">
        <CardHeader>
          <CardTitle>Préparation opérationnelle</CardTitle>
          <CardDescription>
            Ouvrez le planning sur la journée « Demain » pour préparer les
            assignations sans notifier l’équipe. Quand tout est prêt, validez
            depuis l’écran du planning.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="default"
            size="lg"
            onClick={() => {
              console.log("Mode préparation activé");
              setPreparingTomorrow(true);
              router.push("/planning?mode=prep&date=tomorrow");
            }}
            className="h-auto w-full rounded-xl border shadow-sm px-6 py-5 text-base font-semibold"
          >
            Faire le planning de demain
          </Button>
        </CardContent>
      </Card>

      <PushNotificationCard />
    </div>
  );
}
