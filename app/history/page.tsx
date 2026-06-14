import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { signedReadUrl } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { Backdrop } from "@/components/Backdrop";
import { getTopic, isTopicId, type TopicId } from "@/lib/missionMatrix";
import { levelLabel, isLevel } from "@/lib/levels";

type RenderedItem = {
  id: string;
  topic: TopicId;
  topicLabel: string;
  topicEmoji: string;
  level: number;
  levelLabel: string;
  title: string;
  brief: string | null;
  duration: "short" | "medium" | "long" | null;
  note: string | null;
  photoUrl: string | null;
  completedAt: string;
};

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?callbackUrl=/history");

  const { data: profile } = await supabase
    .from("User")
    .select("id, email")
    .eq("authId", user.id)
    .single();
  if (!profile) redirect("/sign-in");

  const { data: rows } = await supabase
    .from("Completion")
    .select("id, topic, level, aiGenerationId, chosenMissionIndex, note, photoUrl, createdAt")
    .eq("userId", profile.id)
    .order("createdAt", { ascending: false });

  const genIds = [
    ...new Set((rows ?? []).map((r) => r.aiGenerationId).filter(Boolean) as string[]),
  ];
  const { data: generations } = genIds.length > 0
    ? await supabase.from("AiGeneration").select("id, parsedOptions").in("id", genIds)
    : { data: [] };

  const parsedOptionsById = new Map(
    (generations ?? []).map((g) => [g.id, g.parsedOptions]),
  );

  const photoUrlById = new Map(
    await Promise.all(
      (rows ?? []).map(
        async (r) => [r.id, await signedReadUrl(r.photoUrl)] as const,
      ),
    ),
  );

  const items: RenderedItem[] = (rows ?? [])
    .filter((r) => isTopicId(r.topic) && isLevel(r.level))
    .map((r) => {
      const topic = r.topic as TopicId;
      const topicMeta = getTopic(topic);
      let title = "(quest record)";
      let brief: string | null = null;
      let duration: RenderedItem["duration"] = null;

      const opts = r.aiGenerationId
        ? parsedOptionsById.get(r.aiGenerationId)
        : null;
      if (Array.isArray(opts) && r.chosenMissionIndex !== null) {
        const chosen = opts[r.chosenMissionIndex] as
          | { title?: unknown; brief?: unknown; duration?: unknown }
          | undefined;
        if (chosen) {
          if (typeof chosen.title === "string") title = chosen.title;
          if (typeof chosen.brief === "string") brief = chosen.brief;
          if (
            chosen.duration === "short" ||
            chosen.duration === "medium" ||
            chosen.duration === "long"
          ) {
            duration = chosen.duration;
          }
        }
      }

      return {
        id: r.id,
        topic,
        topicLabel: topicMeta.label,
        topicEmoji: topicMeta.emoji,
        level: r.level,
        levelLabel: levelLabel(r.level as 1 | 2 | 3 | 4 | 5 | 6),
        title,
        brief,
        duration,
        note: r.note,
        photoUrl: photoUrlById.get(r.id) ?? null,
        completedAt: r.createdAt,
      };
    });

  const totalsByTopic = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.topic] = (acc[item.topic] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-7">
      <Backdrop />
      <AppHeader back={{ href: "/", label: "Topics" }} username={profile.email} />

      <section className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-solar-cream">Your quest log</h1>
        <p className="text-sm text-solar-sage/70">
          Every quest you’ve completed, newest first.
        </p>
      </section>

      {items.length === 0 ? (
        <section className="rounded-field border border-solar-leafmd bg-solar-panel/60 p-8 text-center text-sm text-solar-sage/80">
          <p>No completed quests yet.</p>
          <p className="mt-2">
            <Link href="/" className="font-bold text-solar-green hover:text-solar-sage">
              Pick a topic
            </Link>{" "}
            and start with level 1.
          </p>
        </section>
      ) : (
        <>
          <section className="flex flex-wrap gap-2 text-xs">
            {Object.entries(totalsByTopic).map(([topic, count]) => {
              const meta = getTopic(topic as TopicId);
              return (
                <span
                  key={topic}
                  className="inline-flex items-center gap-1 rounded-full bg-solar-field px-3 py-1 font-bold text-solar-sage ring-1 ring-solar-leafmd"
                >
                  <span aria-hidden="true">{meta.emoji}</span>
                  {meta.label}: {count}
                </span>
              );
            })}
          </section>

          <ol className="flex flex-col gap-4">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-3xl border border-solar-leafmd bg-solar-panel/70 p-5"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-solar-sage/60">
                  <span>{item.topicEmoji}</span>
                  <span>{item.topicLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Level {item.level} ({item.levelLabel})
                  </span>
                  {item.duration && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{item.duration}</span>
                    </>
                  )}
                  <span className="ml-auto font-mono text-[10px] text-solar-sage/40">
                    {item.completedAt.slice(0, 10)}
                  </span>
                </div>
                <h2 className="text-base font-bold text-solar-cream">
                  {item.title}
                </h2>
                {item.brief && (
                  <p className="mt-1 text-sm text-solar-sage/80">{item.brief}</p>
                )}
                {item.note && (
                  <p className="mt-3 rounded-2xl bg-solar-field/50 px-3 py-2 text-sm italic text-solar-sage/90">
                    {item.note}
                  </p>
                )}
                {item.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.photoUrl}
                    alt="Quest completion photo"
                    className="mt-3 max-h-64 w-full rounded-2xl object-cover"
                  />
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
