import type { Metadata } from "next";

import { Chat } from "@/components/chat/Chat";

import { ChatPageShell } from "./chat-page-shell";

export const metadata: Metadata = {
  title: "Messages",
};

export default function ChatPage() {
  return (
    <ChatPageShell>
      <Chat variant="page" />
    </ChatPageShell>
  );
}
