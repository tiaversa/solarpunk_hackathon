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
import { isLevel, levelLabel, MAX_LEVEL, type Level } from "@/lib/levels";
import { MissionList } from "@/components/MissionList";
import { TopicHeaderActions } from "@/components/TopicHeaderActions";
import { AppHeader } from "@/components/AppHeader";
import { Backdrop } from "@/components/Backdrop";
import { LevelStepper } from "@/components/LevelStepper";
import { signedReadUrl } from "@/lib/supabase";

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
        : "Something went wrong generating quests.";
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
          select: { chosenIndex: true },
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

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-7">
      <Backdrop />
      <AppHeader back={{ href: "/", label: "Topics" }} username={session.user.email} />

      <LevelStepper
        topic={topicId}
        level={level}
        currentLevel={progress.currentLevel}
        completedLevels={progress.completedLevels}
      />

      <section className="flex items-center gap-3">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-solar-field text-2xl ring-1 ring-solar-leafmd"
          aria-hidden="true"
        >
          {topic.emoji}
        </span>
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold text-solar-cream">{topic.label}</h1>
          <p className="text-sm text-solar-sage/80">
            Level {level} of {MAX_LEVEL} — {levelLabel(level)} ·{" "}
            {progress.completedLevels.length}/{MAX_LEVEL} complete
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/topic/${topicId}/progress`}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-solar-green transition hover:text-solar-sage"
        >
          🌱 Your progress
        </Link>
        <TopicHeaderActions
          topic={topicId}
          level={level}
          canRegenerate={Boolean(options && aiGenerationId)}
        />
      </div>

      {generationError ? (
        <div className="rounded-field border border-solar-danger/40 bg-solar-danger/15 p-4 text-sm text-red-200">
          <p className="font-bold text-red-100">Couldn’t generate quests.</p>
          <p className="mt-1">{generationError}</p>
          <p className="mt-2 text-xs text-red-200/80">
            Reloading this page will try again.
          </p>
        </div>
      ) : (
        options &&
        aiGenerationId && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-solar-cream">
                {fromCache ? "Your saved quests" : "Your new quests"}
              </h2>
              <span className="font-mono text-[10px] text-solar-sage/40">
                gen {aiGenerationId.slice(0, 8)}
              </span>
            </div>
            {fromCache && (
              <p className="rounded-field border border-solar-leafmd bg-solar-panel/60 px-4 py-3 text-sm text-solar-sage/80">
                You already have quests for this level. Want something
                different? Use <strong className="text-solar-sage">Regenerate</strong>{" "}
                above for a new set.
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
              completionNote={completion?.note ?? null}
              completionPhotoUrl={completionPhotoUrl}
            />
          </section>
        )
      )}
    </main>
  );
}
