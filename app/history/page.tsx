import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "@/components/SignOutButton";
import { getTopic, isTopicId, type TopicId } from "@/lib/missionMatrix";
import { levelLabel, isLevel } from "@/lib/levels";
import { signedReadUrl } from "@/lib/supabase";

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
  completedAt: Date;
};

export default async function HistoryPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/sign-in?callbackUrl=/history");
  }

  // Server-side render: pull straight from Prisma so the page is fast
  // and indexable. The /api/history endpoint exists for the SDK/JSON
  // contract — same shape, different consumer. Two queries (rather
  // than an include) because Completion.aiGenerationId is a bare FK
  // column without an @relation (see PLAN.md / Step 6).
  const rows = await prisma.completion.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      topic: true,
      level: true,
      aiGenerationId: true,
      chosenMissionIndex: true,
      note: true,
      photoPath: true,
      createdAt: true,
    },
  });

  const genIds = Array.from(
    new Set(rows.map((r) => r.aiGenerationId).filter(Boolean) as string[]),
  );
  const generations =
    genIds.length === 0
      ? []
      : await prisma.aiGeneration.findMany({
          where: { id: { in: genIds } },
          select: { id: true, parsedOptions: true },
        });
  const parsedOptionsById = new Map(
    generations.map((g) => [g.id, g.parsedOptions]),
  );

  // Mint signed read URLs in parallel. Each URL is valid for 1h, which
  // covers the lifetime of this server-rendered HTML response in any
  // realistic browsing session.
  const photoUrlByRowId = new Map<string, string | null>();
  await Promise.all(
    rows.map(async (r) => {
      photoUrlByRowId.set(r.id, await signedReadUrl(r.photoPath));
    }),
  );

  const items: RenderedItem[] = rows
    .filter((r) => isTopicId(r.topic) && isLevel(r.level))
    .map((r) => {
      const topic = r.topic as TopicId;
      const topicMeta = getTopic(topic);
      let title = "(mission record)";
      let brief: string | null = null;
      let duration: RenderedItem["duration"] = null;

      const opts =
        r.aiGenerationId !== null
          ? parsedOptionsById.get(r.aiGenerationId)
          : null;
      if (Array.isArray(opts) && r.chosenMissionIndex !== null) {
        const chosen = opts[r.chosenMissionIndex];
        if (chosen && typeof chosen === "object") {
          const o = chosen as {
            title?: unknown;
            brief?: unknown;
            duration?: unknown;
          };
          if (typeof o.title === "string") title = o.title;
          if (typeof o.brief === "string") brief = o.brief;
          if (
            o.duration === "short" ||
            o.duration === "medium" ||
            o.duration === "long"
          ) {
            duration = o.duration;
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
        photoUrl: photoUrlByRowId.get(r.id) ?? null,
        completedAt: r.createdAt,
      };
    });

  const totalsByTopic = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.topic] = (acc[item.topic] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
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
            href="/preferences"
            className="font-medium text-leaf-700 underline underline-offset-2"
          >
            Preferences
          </Link>
          <SignOutButton />
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <Link
          href="/"
          className="text-xs font-medium text-leaf-700 underline underline-offset-2"
        >
          ← All topics
        </Link>
        <h1 className="text-2xl font-bold text-leaf-700">Your mission log</h1>
        <p className="text-sm text-leaf-700/70">
          Every mission you’ve completed, newest first. Totals per topic
          drive your next set of recommendations.
        </p>
      </section>

      {items.length === 0 ? (
        <section className="rounded-2xl bg-white p-8 text-center text-sm text-leaf-700/80 ring-1 ring-leaf-100">
          <p>No completed missions yet.</p>
          <p className="mt-2">
            <Link
              href="/"
              className="font-semibold text-leaf-700 underline underline-offset-2"
            >
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
                  className="inline-flex items-center gap-1 rounded-full bg-leaf-100 px-3 py-1 font-semibold text-leaf-700"
                >
                  <span aria-hidden="true">{meta.emoji}</span>
                  {meta.label}: {count}
                </span>
              );
            })}
          </section>

          <ol className="flex flex-col gap-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-leaf-100"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-leaf-700/60">
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
                  <span className="ml-auto font-mono text-[10px] text-leaf-700/40">
                    {item.completedAt.toISOString().slice(0, 10)}
                  </span>
                </div>
                <h2 className="text-base font-semibold text-leaf-700">
                  {item.title}
                </h2>
                {item.brief && (
                  <p className="mt-1 text-sm text-leaf-700/80">{item.brief}</p>
                )}
                {item.note && (
                  <p className="mt-3 rounded-lg bg-leaf-100/70 px-3 py-2 text-sm italic text-leaf-700/90">
                    {item.note}
                  </p>
                )}
                {item.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.photoUrl}
                    alt="Mission completion photo"
                    className="mt-3 max-h-64 rounded-lg object-cover"
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
