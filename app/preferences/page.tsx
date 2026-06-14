"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { createClient } from "@/lib/supabase-client";
import { AppHeader } from "@/components/AppHeader";
import { Backdrop } from "@/components/Backdrop";
import { PreferencesForm } from "@/components/PreferencesForm";

type Profile = {
  email: string | null;
  interests: string[] | null;
  preferredDuration: "short" | "medium" | "long" | null;
};

export default function PreferencesPage() {
  const { user, loading: authLoading } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/sign-in?callbackUrl=/preferences"); return; }

    const supabase = createClient();
    supabase
      .from("User")
      .select("email, interests, preferredDuration")
      .eq("authId", user.id)
      .single()
      .then(({ data }) => {
        if (!data) { router.push("/sign-in"); return; }
        setProfile(data as Profile);
      });
  }, [user, authLoading, router]);

  if (authLoading || (user && !profile)) {
    return (
      <main className="relative mx-auto flex min-h-screen max-w-md items-center justify-center">
        <Backdrop />
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-solar-green border-t-transparent" />
      </main>
    );
  }

  if (!profile) return null;

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-7">
      <Backdrop />
      <AppHeader
        back={{ href: "/", label: "Topics" }}
        username={profile.email ?? undefined}
      />

      <section className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-solar-cream">Your preferences</h1>
        <p className="text-sm text-solar-sage/70">
          Tune how quests are generated for you. Changes apply to your next
          set of quest options.
        </p>
      </section>

      <PreferencesForm
        initialInterests={profile.interests ?? []}
        initialPreferredDuration={profile.preferredDuration}
      />
    </main>
  );
}
