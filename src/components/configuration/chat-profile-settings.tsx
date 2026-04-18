"use client";

import { useCallback, useState } from "react";

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
import { useLocalStorageString } from "@/hooks/use-local-storage-string";
import { CHAT_USERNAME_STORAGE_KEY } from "@/lib/chat/constants";

export function ChatProfileSettings() {
  const usernameStore = useLocalStorageString(CHAT_USERNAME_STORAGE_KEY, "");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  const display = usernameStore.value.trim();
  const hasName = display.length > 0;

  const startEdit = useCallback(() => {
    setDraft(display);
    setEditing(true);
  }, [display]);

  const save = useCallback(() => {
    const t = draft.trim();
    if (t.length < 1 || t.length > 120) return;
    usernameStore.setValue(t);
    setEditing(false);
  }, [draft, usernameStore]);

  const disconnect = useCallback(() => {
    usernameStore.clear();
    setEditing(false);
    setDraft("");
  }, [usernameStore]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profil chat & notifications</CardTitle>
        <CardDescription>
          Le prénom sert aux messages et aux alertes planning : il doit correspondre
          à un nom de l’équipe (ex. Thomas) pour recevoir les assignations sur cet
          appareil.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasName && !editing ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Aucun prénom enregistré sur cet appareil. Vous pouvez le définir ici ou
              depuis le chat (icône Messages).
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDraft("");
                setEditing(true);
              }}
            >
              Définir mon prénom
            </Button>
          </div>
        ) : null}
        {hasName && !editing ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              <span className="text-muted-foreground">Prénom : </span>
              <span className="font-medium text-foreground">{display}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={startEdit}>
                Changer de profil
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={disconnect}
              >
                Se déconnecter
              </Button>
            </div>
          </div>
        ) : null}
        {editing ? (
          <div className="space-y-2">
            <Label htmlFor="config-chat-name">Prénom</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="config-chat-name"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={120}
                autoComplete="nickname"
                className="max-w-xs"
                placeholder="ex. Thomas"
              />
              <Button type="button" size="sm" onClick={save}>
                Enregistrer
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Annuler
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
