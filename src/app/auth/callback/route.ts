import { NextResponse } from "next/server";

import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

// Google → Supabase → here with ?code=…; exchange it for a session cookie.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/auth/error", url.origin));
}
