import { cn } from "../../lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyFn: (row: T) => string | number;
  isLoading?: boolean;
  total?: number | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns, data, keyFn, isLoading,
  total = 0, page = 1, limit = 20, onPageChange, onRowClick,
  emptyMessage = "Aucune donnée",
}: DataTableProps<T>) {
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex flex-col gap-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#21262d]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "text-left py-2.5 px-4 text-[11px] font-mono text-[#7d8590] tracking-widest uppercase",
                    col.width
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#21262d]/50">
                  {columns.map((col) => (
                    <td key={col.key} className="py-3 px-4">
                      <div className="h-4 bg-[#161b22] rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-[#7d8590] font-mono text-sm">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={keyFn(row)}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "border-b border-[#21262d]/50 transition-colors",
                    onRowClick && "cursor-pointer hover:bg-[#161b22]"
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn("py-3 px-4 text-sm text-[#e6edf3]", col.width)}>
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
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#21262d]">
          <p className="text-xs font-mono text-[#7d8590]">
            {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} sur {total}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#161b22] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-3 py-1 text-xs font-mono text-[#e6edf3]">{page} / {totalPages}</span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#161b22] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
