"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-client";

export default function DebugPage() {
  const [info, setInfo] = useState<string>("Loading…");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      setInfo(
        `User: ${user ? user.email : "null"}\nError: ${error ? error.message : "none"}\nNote: cookie-based debug unavailable in static export.`,
      );
    });
  }, []);

  return (
    <main style={{ fontFamily: "monospace", padding: "2rem", whiteSpace: "pre-wrap" }}>
      <h2>Auth debug</h2>
      <p>{info}</p>
    </main>
  );
}
