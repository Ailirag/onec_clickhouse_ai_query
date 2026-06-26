import React, { useMemo, useState } from "react";
import { DbSchema, TableInfo } from "../types";
import { Table, Eye, Columns, ChevronDown, ChevronRight, Hash, Sparkles, Search } from "lucide-react";

interface DbSchemaBrowserProps {
  schema: DbSchema | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export default function DbSchemaBrowser({
  schema,
  loading,
  error,
  onRefresh
}: DbSchemaBrowserProps) {
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [showSample, setShowSample] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showOtherDatabases, setShowOtherDatabases] = useState(false);

  const selectedDatabase = schema?.selectedDatabase || "";
  const filteredTables = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const tables = schema?.tables || [];
    if (!term) return tables;

    return tables.filter((table) => {
      const haystack = [
        table.name,
        table.database,
        ...table.columns.map((column) => `${column.name} ${column.type} ${column.comment || ""}`)
      ].join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [schema, searchTerm]);

  const currentTables = filteredTables.filter((table) => !selectedDatabase || table.database === selectedDatabase);
  const otherTables = filteredTables.filter((table) => selectedDatabase && table.database !== selectedDatabase);

  const toggleTable = (name: string) => {
    setExpandedTable(expandedTable === name ? null : name);
  };

  const renderTable = (table: TableInfo) => {
    const isExpanded = expandedTable === table.name;
    const isSampleVisible = showSample === table.name;

    return (
      <div key={`${table.database || ""}.${table.name}`} className="border border-slate-100 rounded-lg bg-slate-50/20 overflow-hidden">
        <div
          onClick={() => toggleTable(table.name)}
          className="flex items-center justify-between gap-3 p-3 cursor-pointer hover:bg-slate-50/80 transition-colors select-none"
        >
          <div className="flex items-center gap-2 min-w-0">
            {isExpanded ? (
              <ChevronDown size={15} className="text-slate-400 shrink-0" />
            ) : (
              <ChevronRight size={15} className="text-slate-400 shrink-0" />
            )}
            <span className="font-semibold text-xs text-slate-800 tracking-tight font-mono truncate">{table.name}</span>

            {table.isEventLog && (
              <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-semibold rounded-full border border-indigo-100 shrink-0">
                <Sparkles size={10} />
                Журнал 1С
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-500 shrink-0">
            <span className="flex items-center gap-1">
              <Hash size={12} />
              {table.rowCount?.toLocaleString() || 0}
            </span>
            <span className="flex items-center gap-1">
              <Columns size={12} />
              {table.columns.length}
            </span>
          </div>
        </div>

        {isExpanded && (
          <div className="border-t border-slate-100 bg-white p-3">
            <div className="flex gap-2 border-b border-slate-100 pb-3 mb-3">
              <button
                onClick={() => setShowSample(null)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  !isSampleVisible ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                Колонки
              </button>
              <button
                onClick={() => setShowSample(table.name)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  isSampleVisible ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Eye size={13} />
                Пример
              </button>
            </div>

            {!isSampleVisible ? (
              <div className="overflow-x-auto max-h-[320px]">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-slate-400 font-semibold border-b border-slate-100">
                      <th className="py-2 font-medium">Колонка</th>
                      <th className="py-2 font-medium">Тип</th>
                      <th className="py-2 font-medium">Комментарий</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-mono">
                    {table.columns.map((col) => (
                      <tr key={col.name} className="hover:bg-slate-50/50">
                        <td className="py-2 font-medium text-slate-800">{col.name}</td>
                        <td className="py-2 text-indigo-600 text-[11px]">{col.type}</td>
                        <td className="py-2 text-slate-500 font-sans text-xs">{col.comment || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                {table.sampleRows && table.sampleRows.length > 0 ? (
                  <table className="w-full text-left text-xs text-slate-600 border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {table.columns.slice(0, 7).map((col) => (
                          <th key={col.name} className="p-2 font-semibold text-slate-500 font-mono text-[11px] whitespace-nowrap">
                            {col.name}
                          </th>
                        ))}
                        {table.columns.length > 7 && <th className="p-2 font-semibold text-slate-500">...</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {table.sampleRows.map((row, rIdx) => (
                        <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50/30">
                          {table.columns.slice(0, 7).map((col) => {
                            const val = row[col.name];
                            return (
                              <td key={col.name} className="p-2 font-mono text-[11px] max-w-[200px] truncate text-slate-700">
                                {val !== null && val !== undefined ? String(val) : "NULL"}
                              </td>
                            );
                          })}
                          {table.columns.length > 7 && <td className="p-2 text-slate-400 text-xs">...</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-center py-4 text-slate-400 text-xs">Нет примеров строк.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div id="db-schema-browser" className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Table size={20} id="schema-icon" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800 tracking-tight font-sans">Схема ClickHouse</h2>
            <p className="text-xs text-slate-500 truncate">
              {selectedDatabase ? `Текущая база: ${selectedDatabase}` : "Доступные таблицы ClickHouse"}
            </p>
          </div>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          id="schema-refresh-btn"
        >
          {loading ? "Загрузка..." : "Обновить"}
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Поиск таблиц или колонок"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-50/50 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500"
          id="schema-search-input"
        />
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 text-xs leading-relaxed" id="schema-error">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-3" id="schema-loading">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <span className="text-xs font-medium">Загружаю схему...</span>
        </div>
      )}

      {!loading && !error && (!schema || schema.tables.length === 0) && (
        <div className="text-center py-10 text-slate-400 text-xs" id="schema-empty">
          Таблицы не найдены.
        </div>
      )}

      {!loading && !error && schema && schema.tables.length > 0 && (
        <div className="space-y-4" id="schema-tables-list">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <span>{selectedDatabase ? "Текущая база" : "Таблицы"}</span>
              <span>{currentTables.length}</span>
            </div>
            {currentTables.length > 0 ? currentTables.map(renderTable) : (
              <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                В текущей базе нет подходящих таблиц.
              </div>
            )}
          </div>

          {otherTables.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowOtherDatabases((value) => !value)}
                className="w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600"
                id="other-databases-toggle"
              >
                <span>Другие базы</span>
                <span>{otherTables.length}</span>
              </button>
              {showOtherDatabases && otherTables.map(renderTable)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
