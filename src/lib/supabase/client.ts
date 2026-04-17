import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type MessageRow = {
  id: string;
  room_id: string;
  sender_name: string;
  content: string;
  /** URL publique Storage (bucket `chat-attachments`) si message photo */
  image_url: string | null;
  /** Message auquel on répond (même room) */
  reply_to_id?: string | null;
  is_edited?: boolean | null;
  created_at: string;
};

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!browserClient) {
    browserClient = createClient(url, key, {
      auth: { persistSession: true },
    });
  }
  return browserClient;
}
