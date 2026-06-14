import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getTopic, isTopicId, type TopicId } from "@/lib/missionMatrix";
import { LEVEL_NUMBERS, levelLabel, type Level } from "@/lib/levels";
import { AppHeader } from "@/components/AppHeader";
import { Backdrop } from "@/components/Backdrop";
import { PlantVine, type VineNode, type VineState } from "@/components/PlantVine";

type Props = { params: Promise<{ topic: string }> };

export default async function ProgressPage({ params }: Props) {
  const { topic: topicParam } = await params;
  if (!isTopicId(topicParam)) notFound();
  const topicId: TopicId = topicParam;
  const topic = getTopic(topicId);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?callbackUrl=/topic/${topicId}/progress`);

  const { data: profile } = await supabase
    .from("User")
    .select("id, email")
    .eq("authId", user.id)
    .single();
  if (!profile) redirect("/sign-in");

  const { data: progress } = await supabase
    .from("Progress")
    .upsert(
      { userId: profile.id, topic: topicId },
      { onConflict: "userId,topic", ignoreDuplicates: true },
    )
    .select("currentLevel, completedLevels")
    .single()
    .then(async (r) => {
      if (r.data) return r;
      return supabase
        .from("Progress")
        .select("currentLevel, completedLevels")
        .eq("userId", profile.id)
        .eq("topic", topicId)
        .single();
    });

  const currentLevel = progress?.currentLevel ?? 1;
  const completedLevels: number[] = progress?.completedLevels ?? [];

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
        username={profile.email}
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
