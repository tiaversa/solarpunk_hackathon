import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase-server";

export default async function DebugPage() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const supabaseCookies = allCookies.filter((c) => c.name.startsWith("sb-") || c.name.includes("supabase") || c.name.includes("auth"));

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  return (
    <main style={{ fontFamily: "monospace", padding: "2rem", whiteSpace: "pre-wrap" }}>
      <h2>Auth debug</h2>
      <p><strong>User:</strong> {user ? user.email : "null"}</p>
      <p><strong>Error:</strong> {error ? error.message : "none"}</p>
      <h3>All cookies received by server ({allCookies.length}):</h3>
      {allCookies.map((c) => (
        <div key={c.name}>
          <strong>{c.name}</strong>: {c.value.slice(0, 60)}…
        </div>
      ))}
      <h3>Supabase/auth cookies ({supabaseCookies.length}):</h3>
      {supabaseCookies.length === 0 && <p>⚠️ No session cookies found — this is why getUser() returns null</p>}
      {supabaseCookies.map((c) => (
        <div key={c.name}>{c.name}: {c.value.slice(0, 80)}</div>
      ))}
    </main>
  );
}
