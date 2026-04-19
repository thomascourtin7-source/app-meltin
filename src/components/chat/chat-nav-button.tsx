"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ChatNavButton() {
  return (
    <Link
      href="/chat"
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "gap-1.5 md:hidden"
      )}
    >
      <MessageCircle className="size-4" aria-hidden />
      Messages
    </Link>
  );
}
