"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { createClient } from "@/lib/supabase-client";
import { getTopic, isTopicId, type TopicId } from "@/lib/missionMatrix";
import { LEVEL_NUMBERS, levelLabel, type Level } from "@/lib/levels";
import { AppHeader } from "@/components/AppHeader";
import { Backdrop } from "@/components/Backdrop";
import { PlantVine, type VineNode, type VineState } from "@/components/PlantVine";

type Progress = { currentLevel: number; completedLevels: number[] };

export default function ProgressPageClient() {
  const params = useParams<{ topic: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useSession();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);

  const topicParam = params?.topic ?? "";

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push(`/sign-in?callbackUrl=/topic/${topicParam}/progress`); return; }
    if (!isTopicId(topicParam)) { router.push("/"); return; }

    const supabase = createClient();
    (async () => {
      const { data: profile } = await supabase
        .from("User")
        .select("id, email")
        .eq("authId", user.id)
        .single();
      if (!profile) { router.push("/sign-in"); return; }

      setUserEmail(profile.email ?? user.email);

      const upsertResult = await supabase
        .from("Progress")
        .upsert(
          { userId: profile.id, topic: topicParam },
          { onConflict: "userId,topic", ignoreDuplicates: true },
        )
        .select("currentLevel, completedLevels")
        .maybeSingle();

      const data = upsertResult.data
        ? upsertResult.data
        : (
            await supabase
              .from("Progress")
              .select("currentLevel, completedLevels")
              .eq("userId", profile.id)
              .eq("topic", topicParam)
              .single()
          ).data;

      setProgress({
        currentLevel: data?.currentLevel ?? 1,
        completedLevels: data?.completedLevels ?? [],
      });
    })();
  }, [user, authLoading, topicParam, router]);

  if (authLoading || !progress || !isTopicId(topicParam)) {
    return (
      <main className="relative mx-auto flex min-h-screen max-w-md items-center justify-center">
        <Backdrop />
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-solar-green border-t-transparent" />
      </main>
    );
  }

  const topicId = topicParam as TopicId;
  const topic = getTopic(topicId);
  const { currentLevel, completedLevels } = progress;

  const nodes: VineNode[] = LEVEL_NUMBERS.map((n) => {
    const done = completedLevels.includes(n);
    const locked = n > currentLevel;
    let state: VineState = "upcoming";
    if (done) state = "done";
    else if (n === currentLevel) state = "active";
    else if (locked) state = "locked";

    return {
      key: String(n),
      label: `Level ${n}`,
      sublabel: levelLabel(n as Level),
      state,
      href: locked ? undefined : `/topic/${topicId}?level=${n}`,
      disabled: locked,
    } satisfies VineNode;
  });

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-7">
      <Backdrop />
      <AppHeader
        back={{ href: `/topic/${topicId}`, label: topic.label }}
        username={userEmail}
      />

      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-solar-cream sm:text-4xl">
          Your Progress
        </h1>
        <p className="text-sm text-solar-sage/80">
          {topic.emoji} {topic.label} · {completedLevels.length}/
          {LEVEL_NUMBERS.length} levels grown
        </p>
      </div>

      <PlantVine nodes={nodes} className="flex-1" />
    </main>
  );
}
