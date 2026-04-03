import type * as React from "react";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ width = "100%", height = 16, borderRadius = 6, className = "", style }: SkeletonProps): React.ReactElement {
  return (
    <div
      className={`wr-skeleton ${className}`}
      style={{ width, height, borderRadius, ...style }}
    />
  );
}

interface SkeletonLineProps {
  lines?: number;
  gap?: number;
  lastLineWidth?: string;
}

export function SkeletonLine({ lines = 3, gap = 8, lastLineWidth = "60%" }: SkeletonLineProps): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? lastLineWidth : "100%"}
          height={14}
        />
      ))}
    </div>
  );
}

interface SkeletonCardProps {
  rows?: number;
}

export function SkeletonCard({ rows = 4 }: SkeletonCardProps): React.ReactElement {
  return (
    <div style={{
      padding: "16px",
      borderRadius: 10,
      background: "var(--wr-card)",
      border: "1px solid var(--wr-border)",
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Skeleton width={32} height={32} borderRadius="50%" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <Skeleton width="50%" height={13} />
          <Skeleton width="30%" height={11} />
        </div>
      </div>
      {/* Body rows */}
      {Array.from({ length: rows - 1 }).map((_, i) => (
        <Skeleton key={i} width={i === rows - 2 ? "70%" : "100%"} height={13} />
      ))}
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  cols?: number;
}

export function SkeletonTable({ rows = 5, cols = 5 }: SkeletonTableProps): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid var(--wr-border)",
      }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} height={12} width={i === 0 ? "60%" : "80%"} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid var(--wr-border)",
          }}
        >
          {Array.from({ length: cols }).map((_, col) => (
            <Skeleton key={col} height={13} width={col === cols - 1 ? "50%" : "90%"} />
          ))}
        </div>
      ))}
    </div>
  );
}
