import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { AppHeader } from "@/components/AppHeader";
import { Backdrop } from "@/components/Backdrop";
import { PreferencesForm } from "@/components/PreferencesForm";

export default async function PreferencesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?callbackUrl=/preferences");

  const { data: profile } = await supabase
    .from("User")
    .select("email, interests, preferredDuration")
    .eq("authId", user.id)
    .single();

  if (!profile) redirect("/sign-in");

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-7">
      <Backdrop />
      <AppHeader back={{ href: "/", label: "Topics" }} username={profile.email} />

      <section className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-solar-cream">Your preferences</h1>
        <p className="text-sm text-solar-sage/70">
          Tune how quests are generated for you. Changes apply to your next
          set of quest options.
        </p>
      </section>

      <PreferencesForm
        initialInterests={profile.interests ?? []}
        initialPreferredDuration={profile.preferredDuration as
          | "short"
          | "medium"
          | "long"
          | null}
      />
    </main>
  );
}
