import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getTopic, isTopicId, type TopicId } from "@/lib/missionMatrix";
import { isLevel, levelLabel, MAX_LEVEL, type Level } from "@/lib/levels";
import { MissionList } from "@/components/MissionList";
import { TopicHeaderActions } from "@/components/TopicHeaderActions";
import { AppHeader } from "@/components/AppHeader";
import { Backdrop } from "@/components/Backdrop";
import { LevelStepper } from "@/components/LevelStepper";
import { LocationTracker } from "@/components/LocationTracker";
import { signedReadUrl } from "@/lib/supabase";
import type { MissionOption } from "@/lib/api-client";

type Props = {
  params: Promise<{ topic: string }>;
  searchParams?: Promise<{ level?: string }>;
};

export default async function TopicPage({ params, searchParams }: Props) {
  const { topic: topicParam } = await params;
  const resolvedSearch = await searchParams;

  if (!isTopicId(topicParam)) notFound();
  const topicId: TopicId = topicParam;
  const topic = getTopic(topicId);

  const supabase = await createClient();
  const { data: { user, session: authSession } } = await supabase.auth.getUser()
    .then(async (u) => ({ data: { ...u.data, session: (await supabase.auth.getSession()).data.session } }));

  if (!user) redirect(`/sign-in?callbackUrl=/topic/${topicId}`);

  const { data: profile } = await supabase
    .from("User")
    .select("id, email")
    .eq("authId", user.id)
    .single();
  if (!profile) redirect("/sign-in");

  const { data: orgMembership } = await supabase
    .from("Organization")
    .select("id")
    .eq("createdByUserId", profile.id)
    .maybeSingle();
  if (orgMembership) redirect(`/org/${orgMembership.id}`);

  // Upsert progress for this topic
  const { data: progress } = await supabase
    .from("Progress")
    .upsert({ userId: profile.id, topic: topicId }, { onConflict: "userId,topic", ignoreDuplicates: true })
    .select("currentLevel, completedLevels")
    .single()
    .then(async (r) => {
      if (r.data) return r;
      return supabase.from("Progress").select("currentLevel, completedLevels")
        .eq("userId", profile.id).eq("topic", topicId).single();
    });

  const currentLevel = (progress?.currentLevel ?? 1) as Level;
  const completedLevels: number[] = progress?.completedLevels ?? [];

  const requestedLevel = Number(resolvedSearch?.level);
  const resolvedLevel: Level = isLevel(requestedLevel) && requestedLevel
    ? requestedLevel
    : currentLevel;
  const level: Level = resolvedLevel <= currentLevel ? resolvedLevel : currentLevel;

  // Call the missions Edge Function from the server
  let options: MissionOption[] | null = null;
  let aiGenerationId: string | null = null;
  let fromCache = false;
  let generationError: string | null = null;

  const functionsUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
  try {
    const missionRes = await fetch(
      `${functionsUrl}/missions?topic=${topicId}&level=${level}`,
      {
        headers: {
          Authorization: `Bearer ${authSession?.access_token ?? ""}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        cache: "no-store",
      },
    );
    if (missionRes.ok) {
      const data = await missionRes.json() as { aiGenerationId: string; options: MissionOption[]; fromCache: boolean };
      options = data.options;
      aiGenerationId = data.aiGenerationId;
      fromCache = data.fromCache;
    } else {
      const err = await missionRes.json() as { error?: string };
      generationError = err.error ?? "Failed to generate quests.";
    }
  } catch {
    generationError = "Something went wrong generating quests.";
  }

  const isLevelCompleted = completedLevels.includes(level);

  const { data: activeChoice } = aiGenerationId
    ? await supabase
        .from("MissionChoice")
        .select("chosenIndex")
        .eq("userId", profile.id)
        .eq("topic", topicId)
        .eq("level", level)
        .eq("aiGenerationId", aiGenerationId)
        .in("status", isLevelCompleted ? ["active", "completed"] : ["active"])
        .maybeSingle()
    : { data: null };

  const { data: genCoords } = aiGenerationId
    ? await supabase
        .from("AiGeneration")
        .select("latitude, longitude")
        .eq("id", aiGenerationId)
        .single()
    : { data: null };

  // When completed, trust the Completion row's index rather than MissionChoice
  // to avoid non-determinism from multiple completed rows for the same slot.
  const { data: completion } = isLevelCompleted
    ? await supabase
        .from("Completion")
        .select("note, photoUrl, chosenMissionIndex, aiGenerationId")
        .eq("userId", profile.id)
        .eq("topic", topicId)
        .eq("level", level)
        .order("createdAt", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const initialChosenIndex = isLevelCompleted
    ? completion?.aiGenerationId === aiGenerationId
      ? (completion.chosenMissionIndex ?? null)
      : null
    : (activeChoice?.chosenIndex ?? null);

  const completionPhotoUrl = await signedReadUrl(completion?.photoUrl ?? null);

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-7">
      <Backdrop />
      <AppHeader back={{ href: "/", label: "Topics" }} username={user.email} />

      <LevelStepper
        topic={topicId}
        level={level}
        currentLevel={currentLevel}
        completedLevels={completedLevels}
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
            {completedLevels.length}/{MAX_LEVEL} complete
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

      {!isLevelCompleted && options && (
        <LocationTracker
          topic={topicId}
          level={level}
          generationHasCoords={!!(genCoords?.latitude && genCoords?.longitude)}
          generationLat={genCoords?.latitude ?? null}
          generationLng={genCoords?.longitude ?? null}
        />
      )}

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
