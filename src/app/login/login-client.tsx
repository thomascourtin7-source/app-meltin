"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getOrCreatePlanningDeviceId,
  persistPlanningAuthSession,
} from "@/lib/auth/planning-auth-session";
import { PLANNING_AGENT_IDENTITY_OPTIONS } from "@/lib/auth/planning-auth-slugs";
import { planningDisplayNameEquals } from "@/lib/planning/planning-team";
import { subscribeChatPush } from "@/lib/push/client-subscribe-chat";
import { ensureServiceWorkerRegistered } from "@/lib/push/register-sw";

type RegistryPayload = { registeredNames: string[]; error?: string };

type AuthOkPayload = { slug: string; displayName: string; token: string; error?: string };

export function LoginClient() {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [registeredNames, setRegisteredNames] = useState<string[] | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [signupSlug, setSignupSlug] = useState<string>("");
  const [loginName, setLoginName] = useState<string>("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadRegistry = useCallback(async () => {
    setRegistryError(null);
    try {
      const res = await fetch("/api/planning-auth/registry");
      const json = (await res.json()) as RegistryPayload;
      if (!res.ok) {
        setRegistryError(json?.error || "Impossible de charger les comptes.");
        setRegisteredNames([]);
        return;
      }
      setRegisteredNames(json.registeredNames ?? []);
    } catch {
      setRegistryError("Réseau indisponible.");
      setRegisteredNames([]);
    }
  }, []);

  useEffect(() => {
    void loadRegistry();
  }, [loadRegistry]);

  const signupOptions = useMemo(() => {
    const names = registeredNames ?? [];
    return PLANNING_AGENT_IDENTITY_OPTIONS.filter(
      (o) => !names.some((n) => planningDisplayNameEquals(n, o.label))
    );
  }, [registeredNames]);

  const loginNamesSorted = useMemo(() => {
    const names = registeredNames ?? [];
    return [...names].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  }, [registeredNames]);

  const finishAuth = useCallback(
    async (payload: AuthOkPayload) => {
      persistPlanningAuthSession({
        slug: payload.slug,
        displayName: payload.displayName,
        token: payload.token,
      });
      await ensureServiceWorkerRegistered();
      const sub = await subscribeChatPush(payload.displayName);
      if (!sub.ok && !sub.offline) {
        console.warn("[login] subscribeChatPush", sub.error);
      }
      router.replace("/planning");
    },
    [router]
  );

  const onSubmit = useCallback(async () => {
    setFormError(null);
    if (password.length < 6) {
      setFormError("Mot de passe : au moins 6 caractères.");
      return;
    }
    if (mode === "signup") {
      const s = signupSlug.trim();
      if (!s) {
        setFormError("Choisissez un prénom.");
        return;
      }
      if (password !== password2) {
        setFormError("Les mots de passe ne correspondent pas.");
        return;
      }
    } else {
      const n = loginName.trim();
      if (!n) {
        setFormError("Choisissez un prénom.");
        return;
      }
    }

    setBusy(true);
    try {
      const path =
        mode === "signup" ? "/api/planning-auth/register" : "/api/planning-auth/login";
      const body =
        mode === "signup"
          ? { slug: signupSlug.trim(), password, deviceId: getOrCreatePlanningDeviceId() }
          : { name: loginName.trim(), password, deviceId: getOrCreatePlanningDeviceId() };

      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as AuthOkPayload;
      if (!res.ok) {
        setFormError(
          typeof json?.error === "string" ? json.error : "Échec de la connexion."
        );
        return;
      }
      if (!json.token || !json.displayName || !json.slug) {
        setFormError("Réponse serveur inattendue.");
        return;
      }
      await finishAuth(json);
    } catch {
      setFormError("Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }, [
    finishAuth,
    mode,
    password,
    password2,
    signupSlug,
    loginName,
  ]);

  const loadingRegistry = registeredNames === null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12">
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Connexion Meltin</CardTitle>
          <CardDescription>
            Choisissez votre prénom et votre mot de passe pour accéder au planning
            et au chat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {registryError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {registryError}
            </p>
          ) : null}

          <div className="flex gap-2 rounded-lg border border-border/60 bg-muted/30 p-1">
            <Button
              type="button"
              variant={mode === "signup" ? "default" : "ghost"}
              className="flex-1"
              size="sm"
              onClick={() => {
                setMode("signup");
                setSignupSlug("");
                setLoginName("");
                setPassword("");
                setPassword2("");
                setFormError(null);
              }}
            >
              Premier accès
            </Button>
            <Button
              type="button"
              variant={mode === "login" ? "default" : "ghost"}
              className="flex-1"
              size="sm"
              onClick={() => {
                setMode("login");
                setSignupSlug("");
                setLoginName("");
                setPassword("");
                setPassword2("");
                setFormError(null);
              }}
            >
              Connexion
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>Prénom</Label>
            {loadingRegistry ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : mode === "signup" ? (
              signupOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Tous les prénoms ont déjà un compte. Utilisez l’onglet « Connexion ».
                </p>
              ) : (
                <Select
                  value={signupSlug || undefined}
                  onValueChange={(v) => setSignupSlug(v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir un prénom disponible…" />
                  </SelectTrigger>
                  <SelectContent>
                    {signupOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            ) : loginNamesSorted.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun compte pour l’instant. Utilisez « Premier accès ».
              </p>
            ) : (
              <Select
                value={loginName || undefined}
                onValueChange={(v) => setLoginName(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir votre prénom…" />
                </SelectTrigger>
                <SelectContent>
                  {loginNamesSorted.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Mot de passe</Label>
            <Input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "Créer un mot de passe" : "Votre mot de passe"}
            />
          </div>

          {mode === "signup" ? (
            <div className="space-y-1.5">
              <Label>Confirmer le mot de passe</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="Répéter le mot de passe"
              />
            </div>
          ) : null}

          {formError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          ) : null}

          <Button
            type="button"
            className="w-full"
            size="lg"
            disabled={
              busy ||
              loadingRegistry ||
              (mode === "signup" && signupOptions.length === 0) ||
              (mode === "login" && loginNamesSorted.length === 0)
            }
            onClick={() => void onSubmit()}
          >
            {busy ? "Patientez…" : mode === "signup" ? "Créer mon compte" : "Se connecter"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
