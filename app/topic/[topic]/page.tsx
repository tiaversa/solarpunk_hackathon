import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getTopic, isTopicId, type TopicId } from "@/lib/missionMatrix";
import { isLevel, LEVELS, levelLabel, type Level } from "@/lib/levels";
import { SignOutButton } from "@/components/SignOutButton";
import { MissionList } from "@/components/MissionList";
import { TopicHeaderActions } from "@/components/TopicHeaderActions";
import { LocationTracker } from "@/components/LocationTracker";
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
      generationError = err.error ?? "Failed to generate missions.";
    }
  } catch {
    generationError = "Something went wrong generating missions.";
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

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-leaf-700">
          <span className="text-2xl" aria-hidden="true">🌱</span>
          <span className="text-lg font-semibold">Solarpunk Missions</span>
        </Link>
        <div className="flex items-center gap-3 text-sm text-leaf-700/80">
          <span>{user.email}</span>
          <SignOutButton />
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <Link href="/" className="text-xs font-medium text-leaf-700 underline underline-offset-2">← All topics</Link>
        <div className="flex items-center gap-3">
          <span className="text-4xl" aria-hidden="true">{topic.emoji}</span>
          <div>
            <h1 className="text-2xl font-bold text-leaf-700">{topic.label}</h1>
            <p className="text-sm text-leaf-700/70">
              Level {level} of 6 — <strong>{levelLabel(level)}</strong> · {completedLevels.length}/6 complete so far
            </p>
          </div>
        </div>
        <nav className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(LEVELS) as unknown as string[]).map((k) => {
            const n = Number(k) as Level;
            const done = completedLevels.includes(n);
            const isCurrent = n === level;
            const isLocked = n > currentLevel;

            if (isLocked) {
              return (
                <span key={n} title="Complete the previous level to unlock"
                  className="cursor-not-allowed rounded-full px-3 py-1 text-xs font-medium ring-1 bg-white text-leaf-700/30 ring-leaf-100">
                  {n}. {levelLabel(n)} 🔒
                </span>
              );
            }

            return (
              <Link key={n} href={`/topic/${topicId}?level=${n}`} prefetch={false}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                  isCurrent ? "bg-leaf-600 text-white ring-leaf-700"
                  : done ? "bg-leaf-100 text-leaf-700 ring-leaf-100 hover:ring-leaf-500"
                  : "bg-white text-leaf-700/70 ring-leaf-100 hover:ring-leaf-500"
                }`}>
                {n}. {levelLabel(n)}{done ? " ✓" : ""}
              </Link>
            );
          })}
        </nav>
      </section>

      <TopicHeaderActions topic={topicId} level={level} canRegenerate={Boolean(options && aiGenerationId)} />

      {!isLevelCompleted && options && (
        <LocationTracker
          topic={topicId} level={level}
          generationHasCoords={!!(genCoords?.latitude && genCoords?.longitude)}
          generationLat={genCoords?.latitude ?? null}
          generationLng={genCoords?.longitude ?? null}
        />
      )}

      {generationError ? (
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-100">
          <p className="font-semibold">Couldn't generate missions.</p>
          <p className="mt-1">{generationError}</p>
          <p className="mt-2 text-xs">Reloading this page will try again.</p>
        </div>
      ) : (
        options && aiGenerationId && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-leaf-700">
                {fromCache ? "Your saved missions for this level" : "Your 3 new missions for this level"}
              </h2>
              <span className="font-mono text-[10px] text-leaf-700/40">gen {aiGenerationId.slice(0, 8)}</span>
            </div>
            {fromCache && (
              <p className="rounded-xl bg-leaf-50 px-4 py-3 text-sm text-leaf-700/80 ring-1 ring-leaf-100">
                You already have missions generated for this level. Use <strong>Regenerate options</strong> to get a new set.
              </p>
            )}
            <MissionList
              key={aiGenerationId}
              topic={topicId} level={level} aiGenerationId={aiGenerationId}
              options={options}
              initialChosenIndex={initialChosenIndex}
              isCompleted={isLevelCompleted}
              completionNote={completion?.note ?? null}
              completionPhotoUrl={completion?.photoUrl ?? null}
            />
          </section>
        )
      )}
    </main>
  );
}
