"use client";

import Link from "next/link";
import { useId } from "react";

export type VineState = "done" | "active" | "upcoming" | "locked";

export type VineNode = {
  key: string;
  label: string;
  /** Optional emoji / glyph shown above the label. */
  icon?: string;
  /** Optional secondary line (e.g. "Level 2 · Make"). */
  sublabel?: string;
  state: VineState;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
};

type Props = {
  nodes: VineNode[];
  /** Vertical distance between adjacent leaves (smaller = closer together). */
  spacing?: number;
  /** Lowest node renders at the bottom (the plant "grows" upward). */
  className?: string;
};

const W = 360;
const STEM_X = 180;
const TOP_PAD = 56;
const BOTTOM_PAD = 68;
const SPACING = 150;
// How far the stem snakes to either side between leaves.
const STEM_SWING = 30;

// Leaf drawn pointing right, attachment point at local origin (0,0).
const LEAF_PATH =
  "M0 0 C 20 -44 78 -46 104 -10 C 78 30 24 26 0 0 Z";
const LEAF_VEIN = "M2 -2 L 96 -14";

const FILL: Record<VineState, string> = {
  done: "rgb(var(--solar-moss))",
  active: "rgb(var(--solar-green))",
  upcoming: "rgb(var(--solar-leafdk))",
  locked: "rgb(var(--solar-leafdk))",
};

const STROKE: Record<VineState, string> = {
  done: "rgb(var(--solar-green))",
  active: "rgb(var(--solar-sage))",
  upcoming: "rgb(var(--solar-leafmd))",
  locked: "rgb(var(--solar-leafmd))",
};

function smoothStem(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1]!;
    const p1 = points[i]!;
    const midY = (p0.y + p1.y) / 2;
    d += ` C ${p0.x} ${midY}, ${p1.x} ${midY}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export function PlantVine({ nodes, spacing = SPACING, className = "" }: Props) {
  const uid = useId().replace(/[:]/g, "");
  const n = nodes.length;
  const H = TOP_PAD + BOTTOM_PAD + Math.max(0, n - 1) * spacing;

  // Geometry per node. Index 0 = bottom of the plant.
  const geom = nodes.map((node, i) => {
    const left = i % 2 === 0; // bottom node leans left, then alternates
    const y = H - BOTTOM_PAD - i * spacing;
    const flip = left ? -1 : 1;
    // Stem swings to the same side as the leaf, then the leaf sits outboard.
    const stemAttachX = STEM_X + flip * STEM_SWING;
    const labelX = stemAttachX + flip * 50;
    return { node, i, left, y, stemAttachX, labelX };
  });

  // Stem runs root (bottom) to tip (top), snaking toward each leaf side.
  const stemPoints = [
    { x: STEM_X, y: H - 18 },
    ...geom.map((g) => ({ x: g.stemAttachX, y: g.y })),
    { x: STEM_X, y: 22 },
  ];

  return (
    <div className={`relative mx-auto w-full max-w-sm ${className}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={`glow-${uid}`} cx="50%" cy="100%" r="60%">
            <stop offset="0%" style={{ stopColor: "rgb(var(--solar-moss))" }} stopOpacity="0.4" />
            <stop offset="100%" style={{ stopColor: "rgb(var(--solar-bg))" }} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Soil glow at the roots */}
        <ellipse cx={STEM_X} cy={H - 6} rx={170} ry={70} fill={`url(#glow-${uid})`} />

        {/* Main stem */}
        <path
          d={smoothStem(stemPoints)}
          style={{ stroke: "rgb(var(--solar-line))" }}
          strokeWidth={11}
          strokeLinecap="round"
        />
        <path
          d={smoothStem(stemPoints)}
          style={{ stroke: "rgb(var(--solar-green))" }}
          strokeWidth={5}
          strokeLinecap="round"
          opacity={0.85}
        />

        {geom.map((g) => {
          const flip = g.left ? -1 : 1;
          const transform = `translate(${g.stemAttachX} ${g.y}) scale(${flip} 1)`;
          return (
            <g key={g.node.key}>
              {/* twig connecting stem to leaf */}
              <path
                d={`M ${g.stemAttachX} ${g.y} q ${flip * 16} 2 ${flip * 30} 10`}
                style={{ stroke: "rgb(var(--solar-line))" }}
                strokeWidth={5}
                strokeLinecap="round"
              />
              {/* shadow leaf */}
              <g transform={`translate(${g.stemAttachX + 3} ${g.y + 7}) scale(${flip} 1)`}>
                <path d={LEAF_PATH} style={{ fill: "rgb(var(--solar-bg))" }} opacity={0.5} />
              </g>
              {/* leaf */}
              <g transform={transform}>
                <path
                  d={LEAF_PATH}
                  style={{ fill: FILL[g.node.state], stroke: STROKE[g.node.state] }}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                <path
                  d={LEAF_VEIN}
                  style={{ stroke: STROKE[g.node.state] }}
                  strokeWidth={1.5}
                  opacity={0.6}
                />
              </g>
            </g>
          );
        })}
      </svg>

      {/* Interactive, accessible overlay positioned over each leaf. */}
      <div className="absolute inset-0">
        {geom.map((g) => {
          const inner = (
            <span className="flex flex-col items-center gap-0.5 leading-tight">
              {g.node.icon && (
                <span className="text-xl" aria-hidden="true">
                  {g.node.icon}
                </span>
              )}
              <span
                className={`text-xs font-bold ${
                  g.node.state === "active"
                    ? "text-solar-cream"
                    : g.node.state === "locked"
                      ? "text-solar-sage/40"
                      : "text-solar-sage"
                }`}
              >
                {g.node.label}
              </span>
              {g.node.sublabel && (
                <span className="text-[10px] font-medium text-solar-sage/70">
                  {g.node.sublabel}
                </span>
              )}
              {g.node.state === "done" && (
                <span
                  className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded bg-solar-green text-[10px] text-solar-bg"
                  aria-hidden="true"
                >
                  ✓
                </span>
              )}
            </span>
          );

          const style = {
            left: `${(g.labelX / W) * 100}%`,
            top: `${(g.y / H) * 100}%`,
          } as const;

          const base =
            "absolute flex w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-center transition";

          if (g.node.href && !g.node.disabled) {
            return (
              <Link
                key={g.node.key}
                href={g.node.href}
                prefetch={false}
                style={style}
                className={`${base} hover:scale-105`}
              >
                {inner}
              </Link>
            );
          }

          if (g.node.onClick && !g.node.disabled) {
            return (
              <button
                key={g.node.key}
                type="button"
                onClick={g.node.onClick}
                style={style}
                className={`${base} hover:scale-105 disabled:opacity-70`}
              >
                {inner}
              </button>
            );
          }

          return (
            <div
              key={g.node.key}
              style={style}
              className={`${base} ${g.node.disabled ? "cursor-not-allowed" : ""}`}
            >
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
