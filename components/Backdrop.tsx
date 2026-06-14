/**
 * Decorative, non-interactive background used across the app. Recreates the
 * blurred organic "vine" silhouettes from the design SVGs as a fixed,
 * pointer-events-none layer behind the page content.
 */
export function Backdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-solar-bg"
    >
      <svg
        className="absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2"
        viewBox="0 0 402 874"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <g style={{ opacity: 0.22, filter: "blur(8px)" }}>
          <path
            d="M40.9,8.5L54.9,111.5C54.9,111.5,80.7,239,162.9,246.5C250.1,254.4,273.9,200.5,326.9,213.5C389.6,228.9,398.9,279.5,384.9,331.5C370.4,385.5,296.9,371.5,296.9,371.5C296.9,371.5,175.6,357.3,131.9,425.5C99.9,475.5,112.2,561.1,151.9,586.5C226.8,634.4,263.9,601.5,330.9,619.5C410.3,640.8,427.9,719.5,427.9,719.5L442.9,877.5"
            style={{ stroke: "rgb(var(--solar-sage))" }}
            strokeWidth={150}
            strokeLinecap="round"
          />
        </g>
        <g style={{ opacity: 0.12, filter: "blur(10px)" }}>
          <path
            d="M-20,760C60,700,120,640,90,540C60,440,-40,420,10,300C60,180,200,200,260,120"
            style={{ stroke: "rgb(var(--solar-moss))" }}
            strokeWidth={120}
            strokeLinecap="round"
          />
        </g>
      </svg>
    </div>
  );
}

/**
 * Small sprout/leaf brand mark used as the app logo. Replaces the gray
 * placeholder square in the design mocks.
 */
export function Sprout({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M32 58V30"
        style={{ stroke: "rgb(var(--solar-green))" }}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <path
        d="M32 34C32 22 22 14 8 14C8 28 18 36 32 36Z"
        style={{ fill: "rgb(var(--solar-moss))", stroke: "rgb(var(--solar-green))" }}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path
        d="M32 28C32 16 42 8 56 8C56 22 46 30 32 30Z"
        style={{ fill: "rgb(var(--solar-green))", stroke: "rgb(var(--solar-sage))" }}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}
