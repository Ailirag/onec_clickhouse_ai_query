import React, { useState, useMemo } from "react";
import { QueryResult } from "../types";
import { Search, ChevronLeft, ChevronRight, Copy, Check, Table2 } from "lucide-react";

interface QueryResultViewerProps {
  result: QueryResult | null;
  loading: boolean;
  question?: string;
}

function summarizeError(error = "") {
  if (/ENOTFOUND/i.test(error)) return "DNS-имя не удалось разрешить.";
  if (/TIMEOUT|UND_ERR_CONNECT_TIMEOUT/i.test(error)) return "Истекло время подключения.";
  if (/AUTHENTICATION_FAILED|password is incorrect/i.test(error)) return "Ошибка авторизации.";
  if (/UNKNOWN_TABLE|Unknown table/i.test(error)) return "В SQL указана неизвестная таблица.";
  if (/Yandex/i.test(error) && /unknown model|404/i.test(error)) return "Модель Yandex не найдена.";
  if (/fetch failed/i.test(error)) return "Сетевой запрос не выполнен.";
  return "Запрос завершился с ошибкой.";
}

export default function QueryResultViewer({ result, loading, question }: QueryResultViewerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [copiedCell, setCopiedCell] = useState<{ row: number; col: string } | null>(null);

  const handleCopy = (text: string, rowIdx: number, colName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCell({ row: rowIdx, col: colName });
    setTimeout(() => setCopiedCell(null), 1500);
  };

  // Reset page when result changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [result]);

  const filteredRows = useMemo(() => {
    if (!result || !result.rows) return [];
    if (!searchTerm.trim()) return result.rows;

    const term = searchTerm.toLowerCase();
    return result.rows.filter((row) =>
      Object.values(row).some((val) =>
        String(val).toLowerCase().includes(term)
      )
    );
  }, [result, searchTerm]);

  const paginatedRows = useMemo(() => {
    const startIdx = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(startIdx, startIdx + rowsPerPage);
  }, [filteredRows, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredRows.length / rowsPerPage);

  if (loading) {
    return (
      <div id="query-result-viewer-loading" className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-4 border-slate-100 border-t-emerald-600 rounded-full animate-spin"></div>
        <span className="text-xs font-semibold text-slate-500">Запрос выполняется в ClickHouse...</span>
      </div>
    );
  }

  if (!result) return null;

  if (!result.success) {
    return (
      <div id="query-result-viewer-error" className="bg-red-50 border border-red-100 rounded-xl p-5 text-xs text-red-800 leading-normal flex flex-col gap-2.5">
        <div className="font-bold text-sm">{summarizeError(result.error)}</div>
        <div className="text-[11px] text-red-700">Проверьте подключение, выбранную базу, схему или синтаксис SQL.</div>
        <details className="mt-1">
          <summary className="cursor-pointer font-semibold text-red-700">Детали</summary>
          <pre className="mt-2 p-3 bg-red-100/50 rounded-lg text-[11px] font-mono whitespace-pre-wrap select-text">{result.error}</pre>
        </details>
      </div>
    );
  }

  const columns = result.columns || [];

  return (
    <div id="query-result-viewer" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header with stats */}
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
            <Table2 size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-800 tracking-tight">Таблица результатов запроса</h3>
            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
              <span>Получено строк: <strong className="text-slate-700">{result.rowCount?.toLocaleString()}</strong></span>
              <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
              <span>Время выполнения: <strong className="text-slate-700">{result.elapsedMs} мс</strong></span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-xs w-full">
          <Search size={14} className="absolute left-3.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
            placeholder="Искать в результатах..."
            id="result-search-input"
          />
        </div>
      </div>

      <div className="px-6 py-3 border-b border-slate-100 bg-white text-xs text-slate-600 space-y-2">
        {question && (
          <div>
            <span className="font-semibold text-slate-500">Вопрос:</span> {question}
          </div>
        )}
        <details>
          <summary className="cursor-pointer font-semibold text-slate-500">Выполненный SQL</summary>
          <pre className="mt-2 p-3 rounded-lg bg-slate-950 text-emerald-400 overflow-x-auto text-[11px]">{result.sql}</pre>
        </details>
      </div>

      {result.repair && (
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-900">
          <div className="font-semibold mb-1">SQL был автоматически исправлен после ошибки ClickHouse.</div>
          {result.repair.explanation && (
            <div className="leading-normal">{result.repair.explanation}</div>
          )}
        </div>
      )}

      {filteredRows.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-xs" id="result-empty-search">
          Ничего не найдено по фильтру "{searchTerm}"
        </div>
      ) : (
        <>
          {/* Scrollable table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-slate-600 text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200/60 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="p-3.5 font-medium w-12 text-center border-r border-slate-100">#</th>
                  {columns.map((col) => (
                    <th key={col} className="p-3.5 font-medium whitespace-nowrap border-r border-slate-100">
                      <div className="flex flex-col">
                        <span>{col}</span>
                        {result.columnTypes?.[col] && (
                          <span className="text-[9px] text-indigo-500 font-mono lowercase normal-case mt-0.5 font-normal">
                            {result.columnTypes[col]}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/70">
                {paginatedRows.map((row, rIdx) => {
                  const absoluteIndex = (currentPage - 1) * rowsPerPage + rIdx + 1;
                  return (
                    <tr key={rIdx} className="hover:bg-slate-50/40 transition-colors">
                      <td className="p-3.5 text-center font-semibold text-slate-400 border-r border-slate-100 font-mono">
                        {absoluteIndex}
                      </td>
                      {columns.map((col) => {
                        const cellValue = row[col];
                        const textVal = cellValue !== null && cellValue !== undefined ? String(cellValue) : "NULL";
                        const isCopied = copiedCell?.row === rIdx && copiedCell?.col === col;

                        return (
                          <td
                            key={col}
                            onClick={() => handleCopy(textVal, rIdx, col)}
                            className="p-3.5 font-mono text-[11px] text-slate-700 hover:bg-slate-50/80 cursor-pointer relative max-w-[280px] truncate border-r border-slate-100 group"
                            title="Нажмите, чтобы скопировать"
                          >
                            <span className={cellValue === null ? "text-slate-300 italic font-sans" : ""}>
                              {textVal}
                            </span>
                            <span className="absolute right-2 top-3 p-1 bg-white border border-slate-100 rounded-md shadow-sm text-[10px] text-emerald-600 opacity-0 group-hover:opacity-100 transition-all">
                              {isCopied ? <Check size={11} /> : <Copy size={11} className="text-slate-400" />}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination bar */}
          <div className="px-6 py-4 bg-slate-50/30 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span>
                Показано <strong className="text-slate-700">{Math.min(filteredRows.length, (currentPage - 1) * rowsPerPage + 1)}</strong> – <strong className="text-slate-700">{Math.min(filteredRows.length, currentPage * rowsPerPage)}</strong> из <strong className="text-slate-700">{filteredRows.length}</strong> строк
              </span>
              <div className="flex items-center gap-2">
                <span>Строк на странице:</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 rounded border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  id="rows-per-page-select"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5" id="pagination-controls">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white"
                  id="pagination-prev"
                >
                  <ChevronLeft size={14} />
                </button>
                
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                  .map((page, index, arr) => {
                    const prev = arr[index - 1];
                    const showEllipsis = prev && page - prev > 1;

                    return (
                      <React.Fragment key={page}>
                        {showEllipsis && <span className="px-1 text-slate-300">...</span>}
                        <button
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                            currentPage === page
                              ? "bg-emerald-600 text-white"
                              : "border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                          }`}
                          id={`pagination-page-${page}`}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    );
                  })}

                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white"
                  id="pagination-next"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
