import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// This module is pulled into nearly every page's import graph, including
// statically prerendered ones (e.g. /_not-found) that never touch Supabase
// at all. Throwing here at module-evaluation time means a missing env var
// in whatever scope a given build runs under (e.g. a Preview build without
// the Production-only env vars configured) crashes the ENTIRE Next.js
// build, not just auth. Fall back to placeholders instead so the build
// always succeeds; a genuinely misconfigured deployment then fails with a
// normal runtime network/auth error instead of an opaque build failure.
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing Supabase URL or Anon Key environment variables — auth will not work until these are set."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key"
);
