import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTopic, isTopicId, type TopicId } from "@/lib/missionMatrix";
import { LEVEL_NUMBERS, levelLabel, type Level } from "@/lib/levels";
import { AppHeader } from "@/components/AppHeader";
import { Backdrop } from "@/components/Backdrop";
import { PlantVine, type VineNode, type VineState } from "@/components/PlantVine";

type Props = { params: { topic: string } };

export default async function ProgressPage({ params }: Props) {
  if (!isTopicId(params.topic)) notFound();
  const topicId: TopicId = params.topic;
  const topic = getTopic(topicId);

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(`/sign-in?callbackUrl=/topic/${topicId}/progress`);
  }

  const progress = await prisma.progress.upsert({
    where: { userId_topic: { userId: session.user.id, topic: topicId } },
    create: { userId: session.user.id, topic: topicId },
    update: {},
    select: { currentLevel: true, completedLevels: true },
  });

  const nodes: VineNode[] = LEVEL_NUMBERS.map((n) => {
    const done = progress.completedLevels.includes(n);
    const locked = n > progress.currentLevel;
    let state: VineState = "upcoming";
    if (done) state = "done";
    else if (n === progress.currentLevel) state = "active";
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
        username={session.user.email}
      />

      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-solar-cream sm:text-4xl">
          Your Progress
        </h1>
        <p className="text-sm text-solar-sage/80">
          {topic.emoji} {topic.label} · {progress.completedLevels.length}/
          {LEVEL_NUMBERS.length} levels grown
        </p>
      </div>

      <PlantVine nodes={nodes} className="flex-1" />
    </main>
  );
}
