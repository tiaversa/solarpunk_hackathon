/**
 * Diagnostic-only page. Renders the *raw* DB state for a (topic, level)
 * pair belonging to the signed-in user so we can compare what's stored
 * against what the topic page is rendering. Intentionally minimal styling
 * — this is a debugging tool, not a feature.
 *
 * Visit /_debug/topic-state?topic=cooking&level=2 (substitute real values).
 */

import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTopicId, TOPIC_IDS, type TopicId } from "@/lib/missionMatrix";
import { isLevel, type Level } from "@/lib/levels";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: { topic?: string; level?: string };
};

type ParsedMissionOption = {
  title?: unknown;
  duration?: unknown;
};

function formatOption(value: unknown, index: number): string {
  if (value && typeof value === "object") {
    const opt = value as ParsedMissionOption;
    const title = typeof opt.title === "string" ? opt.title : "<no title>";
    const duration =
      typeof opt.duration === "string" ? ` [${opt.duration}]` : "";
    return `[${index}] ${title}${duration}`;
  }
  return `[${index}] <invalid option>`;
}

function safeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export default async function DebugTopicState({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/sign-in?callbackUrl=/_debug/topic-state");
  }
  const userId = session.user.id;

  const topicParam = searchParams?.topic ?? "cooking";
  const levelParam = Number(searchParams?.level ?? "1");
  if (!isTopicId(topicParam)) notFound();
  if (!isLevel(levelParam)) notFound();
  const topic: TopicId = topicParam;
  const level: Level = levelParam;

  const [progress, aiGenerations, missionChoices, completions] =
    await Promise.all([
      prisma.progress.findUnique({
        where: { userId_topic: { userId, topic } },
      }),
      prisma.aiGeneration.findMany({
        where: { userId, topic, level },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          createdAt: true,
          parsedOptions: true,
          error: true,
        },
      }),
      prisma.missionChoice.findMany({
        where: { userId, topic, level },
        orderBy: { chosenAt: "desc" },
      }),
      prisma.completion.findMany({
        where: { userId, topic, level },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  // Replicate exactly what the topic page does, so we can show what it
  // would resolve right now.
  const isLevelCompleted = progress?.completedLevels?.includes(level) ?? false;
  const activeAi = aiGenerations.find(
    (g) => g.status === "active" && g.parsedOptions !== null,
  );
  const resolvedAiGenerationId = activeAi?.id ?? null;
  const resolvedOptions = safeArray(activeAi?.parsedOptions ?? null);

  const resolvedActiveChoice = resolvedAiGenerationId
    ? await prisma.missionChoice.findFirst({
        where: {
          userId,
          topic,
          level,
          status: isLevelCompleted
            ? { in: ["active", "completed"] }
            : "active",
          aiGenerationId: resolvedAiGenerationId,
        },
        select: { chosenIndex: true, id: true },
      })
    : null;

  const resolvedCompletion = isLevelCompleted
    ? await prisma.completion.findFirst({
        where: { userId, topic, level },
        select: {
          id: true,
          note: true,
          photoPath: true,
          aiGenerationId: true,
          chosenMissionIndex: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : null;

  // Things to flag as suspicious. The whole point of this page.
  const warnings: string[] = [];
  if (
    resolvedCompletion?.aiGenerationId &&
    resolvedAiGenerationId &&
    resolvedCompletion.aiGenerationId !== resolvedAiGenerationId
  ) {
    warnings.push(
      `Completion was made against generation ${resolvedCompletion.aiGenerationId.slice(
        0,
        8,
      )} but the topic page would render generation ${resolvedAiGenerationId.slice(
        0,
        8,
      )}. The "chosenMissionIndex" stored on Completion points to a DIFFERENT options array than the one being displayed.`,
    );
  }
  if (
    resolvedActiveChoice?.chosenIndex !== undefined &&
    resolvedActiveChoice?.chosenIndex !== null &&
    resolvedCompletion?.chosenMissionIndex !== undefined &&
    resolvedCompletion?.chosenMissionIndex !== null &&
    resolvedActiveChoice.chosenIndex !== resolvedCompletion.chosenMissionIndex
  ) {
    warnings.push(
      `MissionChoice.chosenIndex (${resolvedActiveChoice.chosenIndex}) and Completion.chosenMissionIndex (${resolvedCompletion.chosenMissionIndex}) DISAGREE for this user+topic+level. The badge position is driven by MissionChoice.chosenIndex.`,
    );
  }
  const activeGens = aiGenerations.filter((g) => g.status === "active");
  if (activeGens.length > 1) {
    warnings.push(
      `${activeGens.length} AiGeneration rows have status="active" for this slot. There should be at most one. The topic page uses the most-recently-created one with non-null parsedOptions.`,
    );
  }
  const activeChoices = missionChoices.filter((c) => c.status === "active");
  if (activeChoices.length > 1) {
    warnings.push(
      `${activeChoices.length} MissionChoice rows have status="active" for this slot. There should be at most one (partial unique index enforces this — its presence here would be a real bug).`,
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 font-mono text-xs text-leaf-700">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-bold">Debug: topic state</h1>
        <p className="text-leaf-700/70">
          User: {session.user.email} ({userId.slice(0, 8)}…)
        </p>
        <p>
          Switch slot via query params:{" "}
          <code>?topic=cooking&amp;level=1</code> — topics:{" "}
          {TOPIC_IDS.join(", ")} — levels: 1–6
        </p>
        <p className="text-base font-bold">
          Showing: topic=<span className="text-leaf-600">{topic}</span>, level=
          <span className="text-leaf-600">{level}</span>
        </p>
      </header>

      {warnings.length > 0 && (
        <section className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200">
          <h2 className="mb-2 text-sm font-bold text-red-700">
            ⚠ Suspicious findings
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-red-700">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg bg-leaf-50 p-4 ring-1 ring-leaf-100">
        <h2 className="mb-2 text-sm font-bold">
          What the topic page WOULD render right now
        </h2>
        <div className="flex flex-col gap-1">
          <div>
            isLevelCompleted: <b>{String(isLevelCompleted)}</b>
          </div>
          <div>
            aiGenerationId (active, has options):{" "}
            <b>{resolvedAiGenerationId ?? "<none>"}</b>
          </div>
          <div>
            activeChoice.chosenIndex:{" "}
            <b>
              {resolvedActiveChoice?.chosenIndex !== undefined
                ? String(resolvedActiveChoice.chosenIndex)
                : "<null>"}
            </b>{" "}
            (this drives which card shows "✓ Completed")
          </div>
          <div>
            completion.chosenMissionIndex:{" "}
            <b>
              {resolvedCompletion?.chosenMissionIndex !== undefined
                ? String(resolvedCompletion.chosenMissionIndex)
                : "<null>"}
            </b>{" "}
            (this is what was on the row when the user clicked Complete)
          </div>
          <div>completion.note: {resolvedCompletion?.note ?? "<null>"}</div>
          <div>
            completion.photoPath:{" "}
            {resolvedCompletion?.photoPath ?? "<null>"}
          </div>
          <div className="mt-2">Resolved options array (rendered to user):</div>
          <ol className="ml-4 list-decimal">
            {resolvedOptions.map((opt, i) => (
              <li key={i}>{formatOption(opt, i)}</li>
            ))}
          </ol>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-white p-4 ring-1 ring-leaf-100">
        <h2 className="text-sm font-bold">Progress</h2>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(progress, null, 2)}
        </pre>
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-white p-4 ring-1 ring-leaf-100">
        <h2 className="text-sm font-bold">
          AiGeneration rows ({aiGenerations.length}, newest first)
        </h2>
        {aiGenerations.length === 0 && <p className="italic">none</p>}
        {aiGenerations.map((g) => {
          const opts = safeArray(g.parsedOptions);
          return (
            <div
              key={g.id}
              className="flex flex-col gap-1 rounded border border-leaf-100 p-2"
            >
              <div>
                id: {g.id} · status:{" "}
                <b
                  className={
                    g.status === "active" ? "text-leaf-600" : "text-leaf-700/60"
                  }
                >
                  {g.status}
                </b>{" "}
                · createdAt: {g.createdAt.toISOString()}
              </div>
              {g.error && <div className="text-red-600">error: {g.error}</div>}
              <ol className="ml-4 list-decimal">
                {opts.map((opt, i) => (
                  <li key={i}>{formatOption(opt, i)}</li>
                ))}
              </ol>
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-white p-4 ring-1 ring-leaf-100">
        <h2 className="text-sm font-bold">
          MissionChoice rows ({missionChoices.length}, newest first)
        </h2>
        {missionChoices.length === 0 && <p className="italic">none</p>}
        {missionChoices.map((c) => {
          const opts = safeArray(c.optionsPresented);
          return (
            <div
              key={c.id}
              className="flex flex-col gap-1 rounded border border-leaf-100 p-2"
            >
              <div>
                id: {c.id} · status: <b>{c.status}</b> · chosenIndex:{" "}
                <b className="text-leaf-600">{c.chosenIndex}</b> ·
                aiGenerationId: {c.aiGenerationId} · chosenAt:{" "}
                {c.chosenAt.toISOString()}
              </div>
              <div className="text-leaf-700/70">
                optionsPresented (what the user was looking at when they
                clicked Choose):
              </div>
              <ol className="ml-4 list-decimal">
                {opts.map((opt, i) => (
                  <li
                    key={i}
                    className={
                      i === c.chosenIndex ? "font-bold text-leaf-600" : ""
                    }
                  >
                    {formatOption(opt, i)}
                    {i === c.chosenIndex ? "   ← chosen" : ""}
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-white p-4 ring-1 ring-leaf-100">
        <h2 className="text-sm font-bold">
          Completion rows ({completions.length}, newest first)
        </h2>
        {completions.length === 0 && <p className="italic">none</p>}
        {completions.map((c) => (
          <div
            key={c.id}
            className="flex flex-col gap-1 rounded border border-leaf-100 p-2"
          >
            <div>
              id: {c.id} · createdAt: {c.createdAt.toISOString()}
            </div>
            <div>
              aiGenerationId: {c.aiGenerationId ?? "<null>"} ·
              chosenMissionIndex:{" "}
              <b className="text-leaf-600">
                {c.chosenMissionIndex ?? "<null>"}
              </b>
            </div>
            <div>note: {c.note ?? "<null>"}</div>
            <div>photoPath: {c.photoPath ?? "<null>"}</div>
          </div>
        ))}
      </section>
    </main>
  );
}
