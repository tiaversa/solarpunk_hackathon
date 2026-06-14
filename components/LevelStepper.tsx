import Link from "next/link";
import { LEVEL_NUMBERS, levelLabel, type Level } from "@/lib/levels";
import type { TopicId } from "@/lib/missionMatrix";

type Props = {
  topic: TopicId;
  /** The level currently being viewed. */
  level: Level;
  /** Highest unlocked level. */
  currentLevel: number;
  completedLevels: number[];
};

export function LevelStepper({
  topic,
  level,
  currentLevel,
  completedLevels,
}: Props) {
  return (
    <nav className="-mx-6 px-6">
      <ol className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-1">
        {LEVEL_NUMBERS.map((n, idx) => {
          const done = completedLevels.includes(n);
          const isViewing = n === level;
          const locked = n > currentLevel;
          const label = levelLabel(n as Level);

          const pill = isViewing
            ? "bg-solar-green text-solar-cream"
            : done
              ? "text-solar-sage"
              : locked
                ? "text-solar-sage/35"
                : "text-solar-sage/70";

          const content = (
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition ${pill}`}
            >
              {label}
              {done && !isViewing && <span aria-hidden="true">✓</span>}
              {locked && (
                <span aria-hidden="true" className="opacity-70">
                  🔒
                </span>
              )}
            </span>
          );

          return (
            <li key={n} className="flex shrink-0 items-center">
              {idx > 0 && (
                <span aria-hidden="true" className="px-0.5 text-solar-line">
                  ·
                </span>
              )}
              {locked ? (
                <span title="Complete the previous level to unlock">
                  {content}
                </span>
              ) : (
                <Link href={`/topic/${topic}?level=${n}`} prefetch={false}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
