export type ClientChatSenderType = "client" | "agent";

export type ClientChatMessageRow = {
  id: string;
  created_at: string;
  spreadsheet_id: string;
  service_id: string;
  sender_type: ClientChatSenderType;
  sender_name: string;
  message: string;
};

import type { TrackMissionSnapshot } from "@/lib/client-chat/track-timeline";

export type TrackServicePayload = {
  shareToken: string;
  spreadsheetId: string;
  serviceId: string;
  passengerLabel: string;
  agentName: string | null;
  status: string;
  statusTone: "default" | "active" | "done" | "alert";
  timeline: TrackMissionSnapshot;
};

export type ShareLinkPayload = {
  shareToken: string;
  trackUrl: string;
};
