"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="text-sm font-medium text-leaf-700 underline underline-offset-2 hover:text-leaf-600"
    >
      Sign out
    </button>
  );
}
