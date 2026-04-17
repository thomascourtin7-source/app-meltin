"use client";

import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useChatUI } from "./chat-ui-provider";

export function ChatNavButton() {
  const { setMobileOpen } = useChatUI();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5 md:hidden"
      onClick={() => setMobileOpen(true)}
    >
      <MessageCircle className="size-4" aria-hidden />
      Messages
    </Button>
  );
}

