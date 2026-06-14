"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { getHistory, type HistoryItem } from "@/lib/api-client";
import { getTopic, isTopicId, type TopicId } from "@/lib/missionMatrix";
import { levelLabel, isLevel } from "@/lib/levels";
import { AppHeader } from "@/components/AppHeader";
import { Backdrop } from "@/components/Backdrop";

type RenderedItem = HistoryItem & {
  topicLabel: string;
  topicEmoji: string;
  levelLabel: string;
};

export default function HistoryPage() {
  const { user, loading: authLoading } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<RenderedItem[]>([]);
  const [totalsByTopic, setTotalsByTopic] = useState<Record<string, number>>({});
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/sign-in?callbackUrl=/history"); return; }

    getHistory()
      .then(({ items: raw, totalsByTopic: totals }) => {
        const rendered: RenderedItem[] = raw
          .filter((r) => isTopicId(r.topic) && isLevel(r.level))
          .map((r) => {
            const meta = getTopic(r.topic as TopicId);
            return {
              ...r,
              topicLabel: meta.label,
              topicEmoji: meta.emoji,
              levelLabel: levelLabel(r.level as 1 | 2 | 3 | 4 | 5 | 6),
            };
          });
        setItems(rendered);
        setTotalsByTopic(totals);
      })
      .catch(() => {})
      .finally(() => setPageLoading(false));
  }, [user, authLoading, router]);

  if (authLoading || pageLoading) {
    return (
      <main className="relative mx-auto flex min-h-screen max-w-md items-center justify-center">
        <Backdrop />
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-solar-green border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-7">
      <Backdrop />
      <AppHeader
        back={{ href: "/", label: "Topics" }}
        username={user?.email ?? undefined}
      />

      <section className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-solar-cream">Your quest log</h1>
        <p className="text-sm text-solar-sage/70">
          Every quest you've completed, newest first.
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
                  {item.title ?? "(quest record)"}
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
