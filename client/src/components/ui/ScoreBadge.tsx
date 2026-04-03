import type * as React from "react";

interface ScoreBadgeProps {
  score: number; // 0–100
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const SIZE_MAP = {
  sm: { r: 14, stroke: 2.5, fontSize: 8, viewBox: 36 },
  md: { r: 20, stroke: 3,   fontSize: 11, viewBox: 50 },
  lg: { r: 28, stroke: 3.5, fontSize: 14, viewBox: 68 },
};

function scoreColor(score: number): string {
  const hue = (1 - score / 100) * 120; // 120 = green, 0 = red
  return `hsl(${hue}, 72%, 42%)`;
}

export function ScoreBadge({ score, size = "md", showLabel = false }: ScoreBadgeProps): React.ReactElement {
  const { r, stroke, fontSize, viewBox } = SIZE_MAP[size];
  const cx = viewBox / 2;
  const cy = viewBox / 2;
  const circumference = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(100, score));
  const offset = circumference - (progress / 100) * circumference;
  const color = scoreColor(progress);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <svg
        width={viewBox}
        height={viewBox}
        viewBox={`0 0 ${viewBox} ${viewBox}`}
        style={{ display: "block" }}
      >
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        {/* Progress arc */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.4s ease" }}
        />
        {/* Score text */}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize={fontSize}
          fontWeight={700}
          fontFamily="'JetBrains Mono', monospace"
        >
          {progress}
        </text>
      </svg>
      {showLabel && (
        <span style={{ fontSize: 9, color: "var(--wr-text-3)", fontFamily: "monospace", letterSpacing: "0.05em" }}>
          SCORE
        </span>
      )}
    </div>
  );
}
