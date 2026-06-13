import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "@/components/SignOutButton";
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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-leaf-700">
          <span className="text-2xl" aria-hidden="true">
            🌱
          </span>
          <span className="text-lg font-semibold">Solarpunk Missions</span>
        </Link>
        <div className="flex items-center gap-3 text-sm text-leaf-700/80">
          <span>{user.email}</span>
          <SignOutButton />
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <Link
          href="/"
          className="text-xs font-medium text-leaf-700 underline underline-offset-2"
        >
          ← All topics
        </Link>
        <h1 className="text-2xl font-bold text-leaf-700">Your preferences</h1>
        <p className="text-sm text-leaf-700/70">
          Tune how Claude generates missions for you. Changes apply to your
          next set of mission options (existing generations stay as they
          are).
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
