import { cn } from "../../lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  trend?: { value: number; label: string };
  accent?: "default" | "danger" | "warning" | "success";
  className?: string;
}

const ACCENT = {
  default: "border-[#21262d]",
  danger:  "border-red-400/30",
  warning: "border-amber-400/30",
  success: "border-emerald-400/30",
};

const ICON_BG = {
  default: "bg-[#161b22] text-[#7d8590]",
  danger:  "bg-red-400/10 text-red-400",
  warning: "bg-amber-400/10 text-amber-400",
  success: "bg-emerald-400/10 text-emerald-400",
};

export function StatCard({ label, value, sub, icon: Icon, trend, accent = "default", className }: StatCardProps) {
  return (
    <div className={cn(
      "relative bg-[#0d1117] border rounded-lg p-4 overflow-hidden animate-slide-in",
      ACCENT[accent], className
    )}>
      {/* Ligne de couleur en haut */}
      <div className={cn("absolute top-0 left-0 right-0 h-[2px]",
        accent === "danger"  ? "bg-red-400/60" :
        accent === "warning" ? "bg-amber-400/60" :
        accent === "success" ? "bg-emerald-400/60" :
        "bg-[#58a6ff]/40"
      )} />

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-mono text-[#7d8590] tracking-widest uppercase mb-2">{label}</p>
          <p className="text-2xl font-semibold text-[#e6edf3] font-mono tabular-nums">{value}</p>
          {sub && <p className="text-xs text-[#7d8590] mt-1">{sub}</p>}
          {trend && (
            <p className={cn(
              "text-[11px] font-mono mt-2",
              trend.value > 0 ? "text-red-400" : trend.value < 0 ? "text-emerald-400" : "text-[#7d8590]"
            )}>
              {trend.value > 0 ? "▲" : trend.value < 0 ? "▼" : "—"} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn("w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0", ICON_BG[accent])}>
            <Icon size={16} />
          </div>
        )}
      </div>
    </div>
  );
}
