import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface Column<T> {
  key:     string;
  header:  string;
  render:  (row: T) => React.ReactNode;
  width?:  string;
}

interface DataTableProps<T> {
  columns:       Column<T>[];
  data:          T[];
  keyFn:         (row: T) => string | number;
  isLoading?:    boolean | undefined;
  total?:        number | undefined;
  page?:         number | undefined;
  limit?:        number | undefined;
  onPageChange?: ((page: number) => void) | undefined;
  onRowClick?:   ((row: T) => void) | undefined;
  emptyMessage?: string | undefined;
}

const C = {
  surface:  "#1E2A40",
  surface2: "#172035",
  border:   "rgba(255,255,255,0.07)",
  border2:  "rgba(255,255,255,0.04)",
  hover:    "rgba(255,255,255,0.025)",
  text1:    "#C8D8EC",
  text2:    "#5A7490",
  text3:    "#3A5070",
  gold:     "#D4AF37",
  mono:     "'JetBrains Mono','Courier New',monospace",
};

export function DataTable<T>({
  columns, data, keyFn, isLoading,
  total = 0, page = 1, limit = 20, onPageChange, onRowClick,
  emptyMessage = "Aucune donnée",
}: DataTableProps<T>) {
  const totalPages = Math.ceil(total / limit);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: "left",
                    padding: "11px 16px",
                    fontSize: 10,
                    fontFamily: C.mono,
                    color: C.text2,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border2}` }}>
                  {columns.map((col) => (
                    <td key={col.key} style={{ padding: "12px 16px" }}>
                      <div style={{
                        height: 14, borderRadius: 4,
                        background: "rgba(255,255,255,0.06)",
                        animation: "pulse 2s ease-in-out infinite",
                      }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    padding: "48px 16px",
                    textAlign: "center",
                    color: C.text3,
                    fontFamily: C.mono,
                    fontSize: 12,
                  }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={keyFn(row)}
                  onClick={() => onRowClick?.(row)}
                  style={{
                    borderBottom: `1px solid ${C.border2}`,
                    cursor: onRowClick ? "pointer" : "default",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={e => { if (onRowClick) (e.currentTarget as HTMLElement).style.background = C.hover; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={{
                        padding: "10px 16px",
                        fontSize: 12.5,
                        color: C.text1,
                        verticalAlign: "middle",
                      }}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px",
          borderTop: `1px solid ${C.border}`,
        }}>
          <p style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, margin: 0 }}>
            {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} sur {total}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              style={{
                padding: "5px 8px", borderRadius: 6,
                background: "transparent",
                border: `1px solid rgba(255,255,255,0.08)`,
                color: page <= 1 ? C.text3 : C.text2,
                cursor: page <= 1 ? "not-allowed" : "pointer",
                opacity: page <= 1 ? 0.4 : 1,
                transition: "all 0.15s",
                display: "flex", alignItems: "center",
              }}
            >
              <ChevronLeft size={13} />
            </button>
            <span style={{ padding: "4px 10px", fontSize: 11, fontFamily: C.mono, color: C.text1 }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              style={{
                padding: "5px 8px", borderRadius: 6,
                background: "transparent",
                border: `1px solid rgba(255,255,255,0.08)`,
                color: page >= totalPages ? C.text3 : C.text2,
                cursor: page >= totalPages ? "not-allowed" : "pointer",
                opacity: page >= totalPages ? 0.4 : 1,
                transition: "all 0.15s",
                display: "flex", alignItems: "center",
              }}
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
