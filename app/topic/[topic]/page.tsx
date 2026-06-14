import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getOrGenerateMission,
  MissionGenerationError,
  type MissionOption,
} from "@/lib/missions";
import { getTopic, isTopicId, type TopicId } from "@/lib/missionMatrix";
import { isLevel, LEVELS, levelLabel, type Level } from "@/lib/levels";
import { SignOutButton } from "@/components/SignOutButton";
import { MissionList } from "@/components/MissionList";
import { TopicHeaderActions } from "@/components/TopicHeaderActions";
import { signedReadUrl } from "@/lib/supabase";
import type { CityResourcePlace } from "@/lib/api-client";

type Props = {
  params: { topic: string };
  searchParams?: { level?: string };
};

export default async function TopicPage({ params, searchParams }: Props) {
  if (!isTopicId(params.topic)) notFound();
  const topicId: TopicId = params.topic;
  const topic = getTopic(topicId);

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(`/sign-in?callbackUrl=/topic/${topicId}`);
  }
  const userId = session.user.id;

  const progress = await prisma.progress.upsert({
    where: { userId_topic: { userId, topic: topicId } },
    create: { userId, topic: topicId },
    update: {},
    select: { currentLevel: true, completedLevels: true },
  });

  const requestedLevel = Number(searchParams?.level);
  const resolvedLevel =
    isLevel(requestedLevel) && requestedLevel
      ? requestedLevel
      : (progress.currentLevel as Level);

  // Prevent accessing locked levels via URL — clamp to currentLevel.
  const level: Level =
    resolvedLevel <= progress.currentLevel
      ? resolvedLevel
      : (progress.currentLevel as Level);

  let options: MissionOption[] | null = null;
  let aiGenerationId: string | null = null;
  let fromCache = false;
  let generationError: string | null = null;
  try {
    const result = await getOrGenerateMission({ userId, topic: topicId, level });
    options = result.options;
    aiGenerationId = result.aiGenerationId;
    fromCache = result.fromCache;
  } catch (err) {
    generationError =
      err instanceof MissionGenerationError
        ? err.message
        : "Something went wrong generating missions.";
  }

  const isLevelCompleted = progress.completedLevels.includes(level);

  // Source of truth for which card shows "✓ Completed" / "✓ Chosen":
  //
  //   - When the level is still in progress, the user's current pick lives
  //     on the active MissionChoice. The partial unique index
  //     (`unique_active_choice WHERE status='active'`) enforces at most
  //     one such row per slot.
  //
  //   - When the level is completed, we read it off the latest Completion
  //     row instead. This is intentional — historically multiple completed
  //     MissionChoice rows can accumulate for the same (user, topic, level)
  //     if anything re-triggers /api/mission/choose after a completion
  //     (offline-sync replay, a stale tab, an `AiGeneration` race that
  //     produced sibling active rows, etc). `findFirst` on MissionChoice
  //     without an ORDER BY then returns a *non-deterministic* row, and
  //     when it picks an older one the badge lands on the wrong card.
  //     The latest Completion's `chosenMissionIndex` is what the user just
  //     submitted, so we trust it.
  const completion = isLevelCompleted
    ? await prisma.completion.findFirst({
        where: { userId, topic: topicId, level },
        select: {
          note: true,
          photoPath: true,
          chosenMissionIndex: true,
          aiGenerationId: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : null;
  const completionPhotoUrl = await signedReadUrl(completion?.photoPath ?? null);

  const activeChoice =
    !isLevelCompleted && aiGenerationId
      ? await prisma.missionChoice.findFirst({
          where: {
            userId,
            topic: topicId,
            level,
            status: "active",
            aiGenerationId,
          },
          // `rankedPlaces` is populated by POST /api/mission/choose
          // immediately after the choice is recorded: Claude picks the
          // top-N most relevant cached places for THIS mission. We
          // read it here so each of the 3 cards on the level can show
          // a different per-mission subset instead of all sharing the
          // raw (city, topic) list. Null when ranking was skipped or
          // failed — handled by the fallback below.
          select: { chosenIndex: true, rankedPlaces: true },
        })
      : null;

  // Prefer the Completion-driven index when the level is done; fall back to
  // MissionChoice for the still-in-progress case. If neither has anything,
  // the chosen index is null and no card renders the badge.
  //
  // We also guard against the very narrow case where the Completion was
  // recorded against a different AiGeneration than the one we're about to
  // render — that'd mean the displayed `options` array is from a different
  // generation, so the stored index points into the wrong array. In that
  // case we don't pick a card (better blank than wrong-card) and the
  // completion details box stays hidden too.
  const initialChosenIndex = isLevelCompleted
    ? completion?.aiGenerationId &&
      completion.aiGenerationId === aiGenerationId
      ? (completion.chosenMissionIndex ?? null)
      : null
    : (activeChoice?.chosenIndex ?? null);

  // Solarpunk-aligned local places to render under the chosen card.
  //
  // Priority order:
  //   1. MissionChoice.rankedPlaces — per-mission top-N picked by
  //      Claude in POST /api/mission/choose. This is what makes the
  //      3 cards on a level surface DIFFERENT places.
  //   2. CityResources.places — the raw (city, topic) cache. Used as
  //      a fallback when ranking is null: row predates this feature,
  //      ranking call failed, or the user had no city set at choose
  //      time so no OSM lookup ran.
  //   3. [] — nothing shown.
  //
  // Gated on initialChosenIndex !== null so we don't render a "places
  // nearby" section before the user commits to a mission. The actual
  // OSM call (Nominatim + Overpass) only ever runs inside
  // POST /api/mission/choose — this server component is read-only.
  let cityPlaces: CityResourcePlace[] = [];
  if (initialChosenIndex !== null) {
    if (activeChoice?.rankedPlaces) {
      cityPlaces = activeChoice.rankedPlaces as unknown as CityResourcePlace[];
    } else {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { city: true },
      });
      const city = user?.city?.trim();
      if (city) {
        const row = await prisma.cityResources.findUnique({
          where: { city_topic: { city, topic: topicId } },
          select: { places: true },
        });
        if (row) {
          cityPlaces = row.places as unknown as CityResourcePlace[];
        }
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-leaf-700">
          <span className="text-2xl" aria-hidden="true">
            🌱
          </span>
          <span className="text-lg font-semibold">Green Quest</span>
        </Link>
        <div className="flex items-center gap-3 text-sm text-leaf-700/80">
          <span>{session.user.email}</span>
          <SignOutButton />
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <Link
          href="/"
          className="text-xs font-medium text-leaf-700 underline underline-offset-2"
        >
          ← All topics
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-4xl" aria-hidden="true">
            {topic.emoji}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-leaf-700">
              {topic.label}
            </h1>
            <p className="text-sm text-leaf-700/70">
              Level {level} of 6 — <strong>{levelLabel(level)}</strong> ·{" "}
              {progress.completedLevels.length}/6 complete so far
            </p>
          </div>
        </div>
        <nav className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(LEVELS) as unknown as string[]).map((k) => {
            const n = Number(k) as Level;
            const done = progress.completedLevels.includes(n);
            const isCurrent = n === level;
            const isLocked = n > progress.currentLevel;

            if (isLocked) {
              return (
                <span
                  key={n}
                  title="Complete the previous level to unlock"
                  className="cursor-not-allowed rounded-full px-3 py-1 text-xs font-medium ring-1 bg-white text-leaf-700/30 ring-leaf-100"
                >
                  {n}. {levelLabel(n)} 🔒
                </span>
              );
            }

            return (
              <Link
                key={n}
                href={`/topic/${topicId}?level=${n}`}
                // Mission generation is an expensive Claude call. Disable
                // App Router's speculative prefetch so hovering / scrolling
                // past pills never triggers a real generation.
                prefetch={false}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                  isCurrent
                    ? "bg-leaf-600 text-white ring-leaf-700"
                    : done
                      ? "bg-leaf-100 text-leaf-700 ring-leaf-100 hover:ring-leaf-500"
                      : "bg-white text-leaf-700/70 ring-leaf-100 hover:ring-leaf-500"
                }`}
              >
                {n}. {levelLabel(n)}
                {done ? " ✓" : ""}
              </Link>
            );
          })}
        </nav>
      </section>

      <TopicHeaderActions
        topic={topicId}
        level={level}
        canRegenerate={Boolean(options && aiGenerationId)}
      />

      {generationError ? (
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-100">
          <p className="font-semibold">Couldn’t generate missions.</p>
          <p className="mt-1">{generationError}</p>
          <p className="mt-2 text-xs">
            Reloading this page will try again. Check the dev server logs and
            <code className="mx-1 rounded bg-white px-1 py-0.5">AiGeneration</code>
            table for the recorded error row.
          </p>
        </div>
      ) : (
        options &&
        aiGenerationId && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-leaf-700">
                {fromCache
                  ? "Your saved missions for this level"
                  : "Your 3 new missions for this level"}
              </h2>
              <span className="font-mono text-[10px] text-leaf-700/40">
                gen {aiGenerationId.slice(0, 8)}
              </span>
            </div>
            {fromCache && (
              <p className="rounded-xl bg-leaf-50 px-4 py-3 text-sm text-leaf-700/80 ring-1 ring-leaf-100">
                You already have missions generated for this level. Want something
                different? Use the{" "}
                <strong className="font-semibold">Regenerate options</strong>{" "}
                button above to generate a new set.
              </p>
            )}
            <MissionList
              key={aiGenerationId}
              topic={topicId}
              level={level}
              aiGenerationId={aiGenerationId}
              options={options}
              initialChosenIndex={initialChosenIndex}
              isCompleted={isLevelCompleted}
              cityPlaces={cityPlaces}
              completionNote={completion?.note ?? null}
              completionPhotoUrl={completionPhotoUrl}
            />
          </section>
        )
      )}
    </main>
  );
}
