import React, { useState, useMemo } from "react";
import { QueryResult } from "../types";
import { Search, ChevronLeft, ChevronRight, Copy, Check, Table2, Download, ClipboardCopy, AlertTriangle, FlaskConical } from "lucide-react";
import { toast } from "./Toast";

interface QueryResultViewerProps {
  result: QueryResult | null;
  loading: boolean;
  question?: string;
  isDemo?: boolean;
}

// Quote a value for CSV (RFC 4180): wrap in quotes and double internal quotes.
function csvCell(value: any) {
  const str = value === null || value === undefined ? "" : String(value);
  return /[",\n\r;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function buildCsv(columns: string[], rows: any[]) {
  const header = columns.map(csvCell).join(",");
  const body = rows.map((row) => columns.map((col) => csvCell(row[col])).join(",")).join("\r\n");
  // BOM so Excel opens UTF-8 (Cyrillic) correctly.
  return "﻿" + header + "\r\n" + body;
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

export default function QueryResultViewer({ result, loading, question, isDemo }: QueryResultViewerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [copiedCell, setCopiedCell] = useState<{ row: number; col: string } | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const handleCopy = (text: string, rowIdx: number, colName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCell({ row: rowIdx, col: colName });
    toast("Значение скопировано");
    setTimeout(() => setCopiedCell(null), 1500);
  };

  const handleExportCsv = () => {
    if (!result?.columns || !result.rows) return;
    const csv = buildCsv(result.columns, filteredRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    link.href = url;
    link.download = `clickhouse-result-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast(`Выгружено строк: ${filteredRows.length.toLocaleString()}`);
  };

  const handleCopyAll = () => {
    if (!result?.columns || !result.rows) return;
    // Tab-separated — pastes cleanly into spreadsheets.
    const tsv = [
      result.columns.join("\t"),
      ...filteredRows.map((row) => result.columns!.map((col) => {
        const v = row[col];
        return v === null || v === undefined ? "" : String(v).replace(/\t/g, " ").replace(/\r?\n/g, " ");
      }).join("\t"))
    ].join("\n");
    navigator.clipboard.writeText(tsv);
    setCopiedAll(true);
    toast(`Скопировано строк: ${filteredRows.length.toLocaleString()}`);
    setTimeout(() => setCopiedAll(false), 1800);
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
      <div id="query-result-viewer-loading" className="surface-card rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg skeleton-shimmer"></div>
          <div className="flex-1 space-y-2">
            <div className="h-3 w-48 rounded skeleton-shimmer"></div>
            <div className="h-2.5 w-64 rounded skeleton-shimmer"></div>
          </div>
        </div>
        <div className="p-4 space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-7 rounded-lg skeleton-shimmer" style={{ opacity: 1 - i * 0.12 }}></div>
          ))}
        </div>
        <div className="px-6 py-3 text-center text-xs font-medium text-slate-400">Запрос выполняется в ClickHouse…</div>
      </div>
    );
  }

  if (!result) return null;

  if (!result.success) {
    return (
      <div id="query-result-viewer-error" className="bg-rose-50 border border-rose-100 rounded-2xl p-5 text-xs text-rose-800 leading-normal flex flex-col gap-2.5 animate-fade-in">
        <div className="font-bold text-sm">{summarizeError(result.error)}</div>
        <div className="text-[11px] text-rose-700">Проверьте подключение, выбранную базу, схему или синтаксис SQL.</div>
        <details className="mt-1">
          <summary className="cursor-pointer font-semibold text-rose-700">Детали</summary>
          <pre className="mt-2 p-3 bg-rose-100/50 rounded-lg text-[11px] font-mono whitespace-pre-wrap select-text">{result.error}</pre>
        </details>
      </div>
    );
  }

  const columns = result.columns || [];

  return (
    <div id="query-result-viewer" className="surface-card rounded-2xl shadow-sm overflow-hidden">
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

        <div className="flex items-center gap-2">
          {/* Export / copy actions */}
          <button
            onClick={handleCopyAll}
            disabled={!result.rows?.length}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors disabled:opacity-50"
            id="copy-all-btn"
            title="Скопировать все строки (TSV — вставится в Excel)"
          >
            {copiedAll ? <Check size={13} className="text-emerald-600" /> : <ClipboardCopy size={13} />}
            <span className="hidden sm:inline">{copiedAll ? "Скопировано" : "Копировать"}</span>
          </button>
          <button
            onClick={handleExportCsv}
            disabled={!result.rows?.length}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50"
            id="export-csv-btn"
            title="Скачать результат в CSV"
          >
            <Download size={13} />
            <span className="hidden sm:inline">CSV</span>
          </button>

          {/* Search */}
          <div className="relative w-full max-w-[200px]">
            <Search size={14} className="absolute left-3.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
              placeholder="Искать…"
              id="result-search-input"
            />
          </div>
        </div>
      </div>

      {isDemo && (
        <div className="px-6 py-2.5 bg-emerald-50 border-b border-emerald-100 text-[11px] text-emerald-800 flex items-center gap-2" id="demo-data-note">
          <FlaskConical size={13} className="text-emerald-600 shrink-0" />
          <span>Демонстрационные данные — это сгенерированный журнал 1С, а не реальная база. Для работы с продом отключите демо-режим в настройках.</span>
        </div>
      )}

      {result.limitApplied && result.rowCount != null && result.rowCount >= result.limitApplied && (
        <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-800 flex items-center gap-2" id="limit-applied-note">
          <AlertTriangle size={13} className="text-amber-500 shrink-0" />
          <span>Показаны первые <strong>{result.limitApplied.toLocaleString()}</strong> строк (применён защитный <code className="font-mono">LIMIT</code>). Уточните запрос или добавьте агрегацию, чтобы увидеть полную картину.</span>
        </div>
      )}

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
          {/* Scrollable table with sticky header */}
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-left border-collapse text-slate-600 text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100/95 backdrop-blur border-b border-slate-200/60 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="p-3.5 font-medium w-12 text-center border-r border-slate-100 bg-slate-100/95">#</th>
                  {columns.map((col) => (
                    <th key={col} className="p-3.5 font-medium whitespace-nowrap border-r border-slate-100 bg-slate-100/95">
                      <div className="flex flex-col">
                        <span>{col}</span>
                        {result.columnTypes?.[col] && (
                          <span className="text-[9px] text-brand-500 font-mono lowercase normal-case mt-0.5 font-normal">
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
                  aria-label="Предыдущая страница"
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
                        {showEllipsis && <span className="px-1 text-slate-300">…</span>}
                        <button
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                            currentPage === page
                              ? "bg-emerald-600 text-white"
                              : "border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                          }`}
                          id={`pagination-page-${page}`}
                          aria-label={`Страница ${page}`}
                          aria-current={currentPage === page ? "page" : undefined}
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
                  aria-label="Следующая страница"
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
