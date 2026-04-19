import type { Metadata } from "next";

import { Chat } from "@/components/chat/Chat";

export const metadata: Metadata = {
  title: "Messages",
};

export default function ChatPage() {
  return (
    <div className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-white">
      <Chat variant="page" />
    </div>
  );
}
