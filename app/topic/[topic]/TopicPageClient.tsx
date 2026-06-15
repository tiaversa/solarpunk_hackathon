"use client";

import { useEffect, useState, useMemo, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/components/SessionProvider";
import { createClient } from "@/lib/supabase-client";
import { getTopic, isTopicId, type TopicId } from "@/lib/missionMatrix";
import { isLevel, levelLabel, MAX_LEVEL, type Level } from "@/lib/levels";
import { MissionList } from "@/components/MissionList";
import { TopicHeaderActions } from "@/components/TopicHeaderActions";
import { AppHeader } from "@/components/AppHeader";
import { Backdrop } from "@/components/Backdrop";
import { LevelStepper } from "@/components/LevelStepper";
import { LocationTracker } from "@/components/LocationTracker";

import type { MissionOption } from "@/lib/api-client";

type Phase1 = {
  profileId: string;
  userEmail: string | undefined;
  currentLevel: Level;
  completedLevels: number[];
};

type Phase2 = {
  options: MissionOption[] | null;
  aiGenerationId: string | null;
  fromCache: boolean;
  generationError: string | null;
  initialChosenIndex: number | null;
  isLevelCompleted: boolean;
  completionNote: string | null;
  completionPhotoUrl: string | null;
  genCoordsLat: number | null;
  genCoordsLng: number | null;
};

function TopicPageInner() {
  const params = useParams<{ topic: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useSession();

  const topicParam = params?.topic ?? "";
  const [phase1, setPhase1] = useState<Phase1 | null>(null);
  const [phase2, setPhase2] = useState<Phase2 | null>(null);
  const [missionsLoading, setMissionsLoading] = useState(false);
  const [missionsKey, setMissionsKey] = useState(0);
  const prevLevelRef = useRef<Level | null>(null);

  const levelParam = searchParams.get("level");
  const level = useMemo<Level>(() => {
    if (!phase1) return 1 as Level;
    const requested = Number(levelParam);
    const resolved: Level = isLevel(requested) && requested ? requested : phase1.currentLevel;
    return resolved <= phase1.currentLevel ? resolved : phase1.currentLevel;
  }, [phase1, levelParam]);

  // Phase 1: auth + profile + org check + progress
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(`/sign-in?callbackUrl=/topic/${topicParam}`);
      return;
    }
    if (!isTopicId(topicParam)) { router.push("/"); return; }

    const supabase = createClient();
    (async () => {
      const { data: profile } = await supabase
        .from("User")
        .select("id, email")
        .eq("authId", user.id)
        .single();
      if (!profile) { router.push("/sign-in"); return; }

      const { data: org } = await supabase
        .from("Organization")
        .select("id")
        .eq("createdByUserId", profile.id)
        .maybeSingle();
      if (org) { router.push(`/org/${org.id}`); return; }

      const upsertResult = await supabase
        .from("Progress")
        .upsert(
          { userId: profile.id, topic: topicParam },
          { onConflict: "userId,topic", ignoreDuplicates: true },
        )
        .select("currentLevel, completedLevels")
        .maybeSingle();

      const progress = upsertResult.data
        ? upsertResult.data
        : (
            await supabase
              .from("Progress")
              .select("currentLevel, completedLevels")
              .eq("userId", profile.id)
              .eq("topic", topicParam)
              .single()
          ).data;

      setPhase1({
        profileId: profile.id,
        userEmail: profile.email ?? user.email,
        currentLevel: (progress?.currentLevel ?? 1) as Level,
        completedLevels: progress?.completedLevels ?? [],
      });
    })();
  }, [user, authLoading, topicParam, router]);

  // Phase 2: missions + state (re-runs when level changes or missionsKey increments)
  useEffect(() => {
    if (!phase1 || !isTopicId(topicParam)) return;

    const { profileId, completedLevels } = phase1;
    const isLevelCompleted = completedLevels.includes(level);
    const functionsUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
    const supabase = createClient();

    const levelChanged = prevLevelRef.current !== level;
    prevLevelRef.current = level;

    let cancelled = false;
    setMissionsLoading(true);
    if (levelChanged) setPhase2(null);

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

      let options: MissionOption[] | null = null;
      let aiGenerationId: string | null = null;
      let fromCache = false;
      let generationError: string | null = null;

      try {
        const res = await fetch(
          `${functionsUrl}/missions?topic=${topicParam}&level=${level}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            },
          },
        );
        if (res.ok) {
          const data = (await res.json()) as {
            aiGenerationId: string;
            options: MissionOption[];
            fromCache: boolean;
          };
          options = data.options;
          aiGenerationId = data.aiGenerationId;
          fromCache = data.fromCache;
        } else {
          const err = (await res.json()) as { error?: string };
          generationError = err.error ?? "Failed to generate quests.";
        }
      } catch {
        generationError = "Something went wrong generating quests.";
      }

      let initialChosenIndex: number | null = null;
      let completionNote: string | null = null;
      let completionPhotoUrl: string | null = null;
      let genCoordsLat: number | null = null;
      let genCoordsLng: number | null = null;

      if (aiGenerationId) {
        const [choiceRes, coordsRes, completionRes] = await Promise.all([
          supabase
            .from("MissionChoice")
            .select("chosenIndex")
            .eq("userId", profileId)
            .eq("topic", topicParam)
            .eq("level", level)
            .eq("aiGenerationId", aiGenerationId)
            .in("status", isLevelCompleted ? ["active", "completed"] : ["active"])
            .maybeSingle(),
          supabase
            .from("AiGeneration")
            .select("latitude, longitude")
            .eq("id", aiGenerationId)
            .single(),
          isLevelCompleted
            ? supabase
                .from("Completion")
                .select("note, photoUrl, chosenMissionIndex, aiGenerationId")
                .eq("userId", profileId)
                .eq("topic", topicParam)
                .eq("level", level)
                .order("createdAt", { ascending: false })
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        genCoordsLat = coordsRes.data?.latitude ?? null;
        genCoordsLng = coordsRes.data?.longitude ?? null;

        initialChosenIndex = isLevelCompleted
          ? completionRes.data?.aiGenerationId === aiGenerationId
            ? (completionRes.data?.chosenMissionIndex ?? null)
            : null
          : (choiceRes.data?.chosenIndex ?? null);

        completionNote = completionRes.data?.note ?? null;

        if (completionRes.data?.photoUrl) {
          try {
            const params = new URLSearchParams({ path: completionRes.data.photoUrl });
            const res = await fetch(
              `${functionsUrl}/photo?${params}`,
              { headers: { Authorization: `Bearer ${token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } },
            );
            if (res.ok) {
              const { signedUrl } = (await res.json()) as { signedUrl: string };
              completionPhotoUrl = signedUrl ?? null;
            }
          } catch {
            completionPhotoUrl = null;
          }
        }
      }

      if (!cancelled) {
        setPhase2({
          options,
          aiGenerationId,
          fromCache,
          generationError,
          initialChosenIndex,
          isLevelCompleted,
          completionNote,
          completionPhotoUrl,
          genCoordsLat,
          genCoordsLng,
        });
        setMissionsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [phase1, level, topicParam, missionsKey]);

  if (authLoading || !phase1 || !isTopicId(topicParam)) {
    return (
      <main className="relative mx-auto flex min-h-screen max-w-md items-center justify-center">
        <Backdrop />
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-solar-green border-t-transparent" />
      </main>
    );
  }

  const topicId = topicParam as TopicId;
  const topic = getTopic(topicId);
  const { currentLevel, completedLevels } = phase1;

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-7">
      <Backdrop />
      <AppHeader
        back={{ href: "/", label: "Topics" }}
        username={phase1.userEmail}
      />

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
          canRegenerate={Boolean(phase2?.options && phase2?.aiGenerationId)}
          onReloadMissions={() => setMissionsKey((k) => k + 1)}
          onResetComplete={() => {
            setPhase1((prev) =>
              prev ? { ...prev, currentLevel: 1 as Level, completedLevels: [] } : prev,
            );
            setPhase2(null);
            setMissionsKey((k) => k + 1);
            router.push(`/topic/${topicId}`);
          }}
        />
      </div>

      {phase2 && !phase2.isLevelCompleted && phase2.options && (
        <LocationTracker
          topic={topicId}
          level={level}
          generationHasCoords={!!(phase2.genCoordsLat && phase2.genCoordsLng)}
          generationLat={phase2.genCoordsLat}
          generationLng={phase2.genCoordsLng}
          onReloadMissions={() => setMissionsKey((k) => k + 1)}
        />
      )}

      {missionsLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-solar-green border-t-transparent" />
        </div>
      )}

      {!missionsLoading && phase2?.generationError && (
        <div className="rounded-field border border-solar-danger/40 bg-solar-danger/15 p-4 text-sm text-red-200">
          <p className="font-bold text-red-100">Couldn't generate quests.</p>
          <p className="mt-1">{phase2.generationError}</p>
          <p className="mt-2 text-xs text-red-200/80">
            Reloading this page will try again.
          </p>
        </div>
      )}

      {!missionsLoading &&
        phase2?.options &&
        phase2?.aiGenerationId && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-solar-cream">
                {phase2.fromCache ? "Your saved quests" : "Your new quests"}
              </h2>
              <span className="font-mono text-[10px] text-solar-sage/40">
                gen {phase2.aiGenerationId.slice(0, 8)}
              </span>
            </div>
            {phase2.fromCache && (
              <p className="rounded-field border border-solar-leafmd bg-solar-panel/60 px-4 py-3 text-sm text-solar-sage/80">
                You already have quests for this level. Want something
                different? Use{" "}
                <strong className="text-solar-sage">Regenerate</strong> above
                for a new set.
              </p>
            )}
            <MissionList
              key={phase2.aiGenerationId}
              topic={topicId}
              level={level}
              aiGenerationId={phase2.aiGenerationId}
              options={phase2.options}
              initialChosenIndex={phase2.initialChosenIndex}
              isCompleted={phase2.isLevelCompleted}
              completionNote={phase2.completionNote}
              completionPhotoUrl={phase2.completionPhotoUrl}
              onLevelComplete={(nextLevel) =>
                setPhase1((prev) =>
                  prev
                    ? {
                        ...prev,
                        currentLevel: nextLevel as typeof prev.currentLevel,
                        completedLevels: prev.completedLevels.includes(level)
                          ? prev.completedLevels
                          : [...prev.completedLevels, level],
                      }
                    : prev,
                )
              }
            />
          </section>
        )}
    </main>
  );
}

export default function TopicPageClient() {
  return (
    <Suspense
      fallback={
        <main className="relative mx-auto flex min-h-screen max-w-md items-center justify-center">
          <Backdrop />
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-solar-green border-t-transparent" />
        </main>
      }
    >
      <TopicPageInner />
    </Suspense>
  );
}
