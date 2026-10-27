import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SUPABASE_URL) ||
  (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_URL ||
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  "https://jxlhavfxxanawexlohkp.supabase.co";

const SUPABASE_ANON_KEY =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
  (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_hIQLqr8wg0e3vXG7Qy5arg_-A9fGf4e";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}