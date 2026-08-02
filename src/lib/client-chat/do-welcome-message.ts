import { parseAssignedAgentNames } from "@/lib/client-chat/assigned-agents";
import type { SupabaseClient } from "@supabase/supabase-js";

export const DO_WELCOME_MESSAGE = "Hi, I'm ready";

export function resolveGreeterWelcomeSenderName(
  assignmentAgentName: string | null | undefined,
  fallbackUserName: string
): string {
  const first = parseAssignedAgentNames(assignmentAgentName)[0];
  const name = first?.trim() || fallbackUserName.trim();
  return name.slice(0, 120);
}

export async function ensureDoWelcomeMessage(
  supabase: SupabaseClient,
  opts: {
    spreadsheetId: string;
    serviceId: string;
    fallbackUserName: string;
  }
): Promise<void> {
  const spreadsheetId = opts.spreadsheetId.trim();
  const serviceId = opts.serviceId.trim();
  if (!spreadsheetId || !serviceId) return;

  const { data: existingWelcome } = await supabase
    .from("client_chat_messages")
    .select("id")
    .eq("spreadsheet_id", spreadsheetId)
    .eq("service_id", serviceId)
    .eq("sender_type", "agent")
    .eq("message", DO_WELCOME_MESSAGE)
    .limit(1)
    .maybeSingle();

  if (existingWelcome) return;

  const { data: assignment } = await supabase
    .from("planning_assignments")
    .select("agent_name")
    .eq("service_id", serviceId)
    .maybeSingle();

  const agentName = resolveGreeterWelcomeSenderName(
    (assignment as { agent_name?: string | null } | null)?.agent_name,
    opts.fallbackUserName
  );

  if (!agentName) return;

  const { error } = await supabase.from("client_chat_messages").insert({
    spreadsheet_id: spreadsheetId,
    service_id: serviceId,
    sender_type: "agent",
    sender_name: agentName,
    message: DO_WELCOME_MESSAGE,
  });

  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(error.message);
  }
}
