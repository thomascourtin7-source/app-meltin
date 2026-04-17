"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  notifySpreadsheetIdChanged,
  useLocalSpreadsheetId,
} from "@/hooks/use-local-spreadsheet-id";
import { writeSpreadsheetId } from "@/lib/client-storage";

const idPattern = /^[a-zA-Z0-9_-]{20,}$/;

export function ConfigurationForm() {
  const stored = useLocalSpreadsheetId();
  const [override, setOverride] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const value = override ?? stored ?? "";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = value.trim();
    if (!idPattern.test(t)) {
      return;
    }
    writeSpreadsheetId(t);
    notifySpreadsheetIdChanged();
    setOverride(null);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  const valid = idPattern.test(value.trim());

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="sheet-id">Identifiant du spreadsheet</Label>
        <Input
          id="sheet-id"
          name="sheet-id"
          placeholder="ex. 1AbCdEfGhIjKlmNoPqRsTuVwXyZ1234567890"
          value={value}
          onChange={(e) => setOverride(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Stocker sur cet appareil (localStorage).{" "}
          <Link href="/" className="font-medium text-primary underline-offset-4 hover:underline">
            Voir le planning
          </Link>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!valid}>
          Enregistrer
        </Button>
        {saved ? (
          <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" aria-hidden />
            Enregistré
          </span>
        ) : null}
      </div>
    </form>
  );
}
