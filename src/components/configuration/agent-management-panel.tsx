"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

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
import { readPlanningAuthSession } from "@/lib/auth/planning-auth-session";
import {
  notifyAgentsCatalogChanged,
} from "@/hooks/use-planning-agent-catalog";
import type { ManagedAgentRow } from "@/lib/planning/planning-agent-catalog";

type ManageResponse = {
  agents?: ManagedAgentRow[];
  error?: string;
};

async function manageFetch(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: Record<string, string>
): Promise<ManagedAgentRow[]> {
  const token = readPlanningAuthSession()?.token?.trim() ?? "";
  if (!token) throw new Error("Session requise.");

  const res = await fetch("/api/planning-auth/agents/manage", {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as ManageResponse;
  if (!res.ok) {
    throw new Error(json?.error || "Action impossible.");
  }
  return json.agents ?? [];
}

export function AgentManagementPanel() {
  const [agents, setAgents] = useState<ManagedAgentRow[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const rows = await manageFetch("GET");
      setAgents(rows.filter((a) => a.isActive));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const afterMutation = useCallback(async (rows: ManagedAgentRow[]) => {
    setAgents(rows.filter((a) => a.isActive));
    notifyAgentsCatalogChanged();
  }, []);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const rows = await manageFetch("POST", { name });
      setNewName("");
      await afterMutation(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ajout impossible.");
    } finally {
      setBusy(false);
    }
  };

  const handleRoleChange = async (name: string, role: "admin" | "agent") => {
    setBusy(true);
    setError(null);
    try {
      const rows = await manageFetch("PATCH", { name, role });
      await afterMutation(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mise à jour impossible.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (name: string) => {
    const ok = window.confirm(
      `Êtes-vous sûr de vouloir supprimer ${name} ? Il n'aura plus accès à l'application.`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const rows = await manageFetch("DELETE", { name });
      await afterMutation(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rounded-xl border shadow-sm">
      <CardHeader>
        <CardTitle>Gestion des agents</CardTitle>
        <CardDescription>
          Ajouter, retirer ou promouvoir des administrateurs. Réservé à Javed,
          JAVED ORDI et Thomas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="new-agent-name">Prénom / nom</Label>
            <Input
              id="new-agent-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex. Kumar"
              disabled={busy}
            />
          </div>
          <Button
            type="button"
            disabled={busy || !newName.trim()}
            onClick={() => void handleAdd()}
          >
            Ajouter l&apos;agent
          </Button>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun agent actif.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-border/60 bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Prénom</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2 font-medium">Rôle</th>
                  <th className="px-3 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr
                    key={agent.name}
                    className="border-b border-border/40 last:border-b-0"
                  >
                    <td className="px-3 py-3 font-medium">{agent.name}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {agent.hasPassword ? "Compte activé" : "Premier accès"}
                    </td>
                    <td className="px-3 py-3">
                      <Select
                        value={agent.role}
                        onValueChange={(value) => {
                          if (value !== "admin" && value !== "agent") return;
                          void handleRoleChange(agent.name, value);
                        }}
                        disabled={busy || agent.isProtected}
                      >
                        <SelectTrigger size="sm" className="w-[8.5rem]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="agent">Agent</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={busy || agent.isProtected}
                        onClick={() => void handleDelete(agent.name)}
                        className="gap-1.5"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Supprimer
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
