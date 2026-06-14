import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/AppHeader";
import { Backdrop } from "@/components/Backdrop";
import { PreferencesForm } from "@/components/PreferencesForm";

export default async function PreferencesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/sign-in?callbackUrl=/preferences");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, interests: true, preferredDuration: true },
  });

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-7">
      <Backdrop />
      <AppHeader back={{ href: "/", label: "Topics" }} username={user.email} />

      <section className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-solar-cream">Your preferences</h1>
        <p className="text-sm text-solar-sage/70">
          Tune how quests are generated for you. Changes apply to your next
          set of quest options.
        </p>
      </section>

      <PreferencesForm
        initialInterests={user.interests}
        initialPreferredDuration={user.preferredDuration as
          | "short"
          | "medium"
          | "long"
          | null}
      />
    </main>
  );
}
