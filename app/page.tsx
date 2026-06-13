import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "@/components/SignOutButton";
import { TopicGrid } from "@/components/TopicGrid";
import { CityField } from "@/components/CityField";
import type { TopicId } from "@/lib/missionMatrix";
import { LEVELS, type Level } from "@/lib/levels";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <span className="text-5xl" aria-hidden="true">
          🌱
        </span>
        <h1 className="text-4xl font-bold tracking-tight text-leaf-700">
          Solarpunk Missions
        </h1>
        <p className="text-lg leading-relaxed text-leaf-700/80">
          Pick a topic, climb six levels &mdash; Explore, Make, Improve,
          Experiment, Connect, Teach &mdash; one hands-on, community-grounded
          mission at a time.
        </p>
        <div className="flex gap-3">
          <Link
            href="/sign-up"
            className="rounded-lg bg-leaf-600 px-5 py-2 font-semibold text-white shadow-sm transition hover:bg-leaf-700"
          >
            Get started
          </Link>
          <Link
            href="/sign-in"
            className="rounded-lg border border-leaf-600 px-5 py-2 font-semibold text-leaf-700 transition hover:bg-leaf-50"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const [user, progressRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { city: true },
    }),
    prisma.progress.findMany({
      where: { userId: session.user.id },
      select: { topic: true, currentLevel: true, completedLevels: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const progressByTopic = new Map<
    TopicId,
    { currentLevel: number; completedLevels: number[] }
  >();
  for (const row of progressRows) {
    progressByTopic.set(row.topic as TopicId, {
      currentLevel: row.currentLevel,
      completedLevels: row.completedLevels,
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-12">
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-leaf-700">
          <span className="text-2xl" aria-hidden="true">
            🌱
          </span>
          <span className="text-lg font-semibold">Solarpunk Missions</span>
        </Link>
        <div className="flex items-center gap-3 text-sm text-leaf-700/80">
          <span>{session.user.email}</span>
          <Link
            href="/history"
            className="font-medium text-leaf-700 underline underline-offset-2 hover:text-leaf-600"
          >
            History
          </Link>
          <Link
            href="/preferences"
            className="font-medium text-leaf-700 underline underline-offset-2 hover:text-leaf-600"
          >
            Preferences
          </Link>
          <SignOutButton />
        </div>
      </header>

      <CityField initialCity={user?.city ?? ""} />

      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-leaf-700">
          Pick a topic to start (or continue) a mission
        </h1>
        <p className="text-sm text-leaf-700/70">
          Each topic has 6 levels: {Object.values(LEVELS).join(" → ")}. AI-generated
          mission options arrive in the next build step.
        </p>
        <TopicGrid
          progressByTopic={Object.fromEntries(progressByTopic) as Record<
            TopicId,
            { currentLevel: Level; completedLevels: number[] }
          >}
        />
      </section>
    </main>
  );
}
