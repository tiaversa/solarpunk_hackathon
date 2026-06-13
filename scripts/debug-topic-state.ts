/**
 * scripts/debug-topic-state.ts
 *
 * One-shot diagnostic. Dumps everything the topic page reasons over —
 * Progress, AiGeneration, MissionChoice, Completion — for every
 * (topic, level) slot belonging to the only user in the DB (or a user
 * passed by --email=). Used to chase the "I picked entry 3 but the
 * Completed badge appears on entry 2" bug.
 *
 * Run:  npx tsx scripts/debug-topic-state.ts [--email=foo@bar.com]
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ParsedOption = {
  title?: unknown;
  duration?: unknown;
};

function fmtOption(value: unknown, i: number): string {
  if (value && typeof value === "object") {
    const o = value as ParsedOption;
    const title = typeof o.title === "string" ? o.title : "<no title>";
    const dur = typeof o.duration === "string" ? `[${o.duration}]` : "";
    return `${i}: ${title} ${dur}`;
  }
  return `${i}: <invalid>`;
}

function fmtOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return ["<not an array>"];
  return value.map((v, i) => fmtOption(v, i));
}

async function main() {
  const emailArg = process.argv
    .slice(2)
    .find((a) => a.startsWith("--email="))
    ?.split("=")[1];

  const user = emailArg
    ? await prisma.user.findUnique({
        where: { email: emailArg },
        select: { id: true, email: true },
      })
    : await prisma.user.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true },
      });

  if (!user) {
    console.error("No user found.");
    process.exit(1);
  }

  console.log(`USER: ${user.email} (${user.id})`);
  console.log("=".repeat(80));

  // Find every (topic, level) that has any activity.
  const completions = await prisma.completion.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const missionChoices = await prisma.missionChoice.findMany({
    where: { userId: user.id },
    orderBy: { chosenAt: "desc" },
  });
  const aiGenerations = await prisma.aiGeneration.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const progressRows = await prisma.progress.findMany({
    where: { userId: user.id },
  });

  const slots = new Set<string>();
  for (const c of completions) slots.add(`${c.topic}|${c.level}`);
  for (const m of missionChoices) slots.add(`${m.topic}|${m.level}`);
  for (const g of aiGenerations) slots.add(`${g.topic}|${g.level}`);

  console.log(`\nProgress rows:`);
  for (const p of progressRows) {
    console.log(
      `  ${p.topic}: currentLevel=${p.currentLevel} completedLevels=[${p.completedLevels.join(",")}]`,
    );
  }

  for (const slot of [...slots].sort()) {
    const [topic, levelStr] = slot.split("|");
    const level = Number(levelStr);
    console.log("\n" + "=".repeat(80));
    console.log(`SLOT: topic=${topic} level=${level}`);
    console.log("=".repeat(80));

    const slotGens = aiGenerations.filter(
      (g) => g.topic === topic && g.level === level,
    );
    const slotChoices = missionChoices.filter(
      (m) => m.topic === topic && m.level === level,
    );
    const slotCompletions = completions.filter(
      (c) => c.topic === topic && c.level === level,
    );

    console.log(`\n  AiGeneration rows (${slotGens.length}, newest first):`);
    for (const g of slotGens) {
      console.log(
        `    - id=${g.id.slice(0, 8)}… status=${g.status} createdAt=${g.createdAt.toISOString()} err=${g.error ?? "—"}`,
      );
      for (const line of fmtOptions(g.parsedOptions)) {
        console.log(`        ${line}`);
      }
    }

    console.log(`\n  MissionChoice rows (${slotChoices.length}, newest first):`);
    for (const m of slotChoices) {
      console.log(
        `    - id=${m.id.slice(0, 8)}… status=${m.status} chosenIndex=${m.chosenIndex} aiGenerationId=${m.aiGenerationId.slice(0, 8)}… chosenAt=${m.chosenAt.toISOString()}`,
      );
      console.log(`      optionsPresented (what user saw when picking):`);
      const opts = fmtOptions(m.optionsPresented);
      for (let i = 0; i < opts.length; i++) {
        const marker = i === m.chosenIndex ? "  <-- CHOSEN" : "";
        console.log(`        ${opts[i]}${marker}`);
      }
    }

    console.log(`\n  Completion rows (${slotCompletions.length}, newest first):`);
    for (const c of slotCompletions) {
      console.log(
        `    - id=${c.id.slice(0, 8)}… aiGenerationId=${c.aiGenerationId?.slice(0, 8) ?? "—"} chosenMissionIndex=${c.chosenMissionIndex} note=${JSON.stringify(c.note)} photoPath=${c.photoPath ?? "—"} createdAt=${c.createdAt.toISOString()}`,
      );
    }

    // Reproduce what the topic page would resolve right now.
    const progress = progressRows.find((p) => p.topic === topic);
    const isLevelCompleted =
      progress?.completedLevels.includes(level) ?? false;
    const activeGen = slotGens.find(
      (g) => g.status === "active" && g.parsedOptions !== null,
    );
    const renderedAiGenId = activeGen?.id ?? null;
    const latestCompletion = slotCompletions[0] ?? null;

    // NEW logic (post-fix in app/topic/[topic]/page.tsx):
    //   - when completed: chosenIndex comes from latest Completion, but only
    //     if its aiGenerationId matches the displayed one
    //   - otherwise: from the active MissionChoice for the displayed gen
    const activeChoiceForRender = renderedAiGenId
      ? slotChoices.find(
          (m) =>
            m.aiGenerationId === renderedAiGenId && m.status === "active",
        )
      : null;
    const newChosenIndex = isLevelCompleted
      ? latestCompletion?.aiGenerationId === renderedAiGenId
        ? (latestCompletion?.chosenMissionIndex ?? null)
        : null
      : (activeChoiceForRender?.chosenIndex ?? null);

    // OLD logic (pre-fix, kept for comparison):
    const oldChoice = renderedAiGenId
      ? slotChoices.find(
          (m) =>
            m.aiGenerationId === renderedAiGenId &&
            (isLevelCompleted
              ? m.status === "active" || m.status === "completed"
              : m.status === "active"),
        )
      : null;
    const oldChosenIndex = oldChoice?.chosenIndex ?? null;

    console.log(`\n  RESOLVED VIEW (what topic page would show):`);
    console.log(`    isLevelCompleted: ${isLevelCompleted}`);
    console.log(
      `    rendered AiGeneration id: ${renderedAiGenId?.slice(0, 8) ?? "<none>"}`,
    );
    console.log(
      `    OLD chosenIndex (pre-fix, JS .find non-determinism): ${oldChosenIndex ?? "<null>"}`,
    );
    console.log(
      `    NEW chosenIndex (post-fix, from latest Completion):  ${newChosenIndex ?? "<null>"}`,
    );
    console.log(
      `    latest completion.chosenMissionIndex: ${latestCompletion?.chosenMissionIndex ?? "<null>"}`,
    );
    console.log(
      `    latest completion.aiGenerationId:   ${latestCompletion?.aiGenerationId?.slice(0, 8) ?? "<null>"}`,
    );

    const warnings: string[] = [];
    if (
      latestCompletion?.aiGenerationId &&
      renderedAiGenId &&
      latestCompletion.aiGenerationId !== renderedAiGenId
    ) {
      warnings.push(
        `Completion references gen ${latestCompletion.aiGenerationId.slice(0, 8)} but topic page would render gen ${renderedAiGenId.slice(0, 8)}.`,
      );
    }
    if (
      oldChosenIndex !== null &&
      latestCompletion?.chosenMissionIndex !== null &&
      latestCompletion?.chosenMissionIndex !== undefined &&
      oldChosenIndex !== latestCompletion.chosenMissionIndex
    ) {
      warnings.push(
        `OLD chosenIndex (${oldChosenIndex}) != latest Completion.chosenMissionIndex (${latestCompletion.chosenMissionIndex}) — pre-fix badge would land on the wrong card.`,
      );
    }
    const activeGenCount = slotGens.filter((g) => g.status === "active").length;
    if (activeGenCount > 1) {
      warnings.push(
        `${activeGenCount} AiGeneration rows have status="active" (should be ≤1).`,
      );
    }
    const activeChoiceCount = slotChoices.filter(
      (c) => c.status === "active",
    ).length;
    if (activeChoiceCount > 1) {
      warnings.push(
        `${activeChoiceCount} MissionChoice rows have status="active" (should be ≤1).`,
      );
    }

    if (warnings.length > 0) {
      console.log(`\n  ⚠  WARNINGS:`);
      for (const w of warnings) console.log(`    - ${w}`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    return prisma.$disconnect().then(() => process.exit(1));
  });
