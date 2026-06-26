import React, { useState } from "react";
import { DbSchema, TableInfo } from "../types";
import { Table, Eye, Columns, ChevronDown, ChevronRight, Hash, Sparkles } from "lucide-react";

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
  const [expandedTable, setExpandedTable] = useState<string | null>("EventLogItems");
  const [showSample, setShowSample] = useState<string | null>(null);

  const toggleTable = (name: string) => {
    setExpandedTable(expandedTable === name ? null : name);
  };

  return (
    <div id="db-schema-browser" className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Table size={22} id="schema-icon" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800 tracking-tight font-sans">Структура базы данных</h2>
            <p className="text-xs text-slate-500">Доступные таблицы и поля в ClickHouse</p>
          </div>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-3.5 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          id="schema-refresh-btn"
        >
          {loading ? "Анализ..." : "Обновить схему"}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 text-xs leading-relaxed" id="schema-error">
          Не удалось загрузить структуру: {error}
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3" id="schema-loading">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <span className="text-xs font-medium">Анализируем содержимое таблиц...</span>
        </div>
      )}

      {!loading && !error && (!schema || schema.tables.length === 0) && (
        <div className="text-center py-12 text-slate-400 text-xs" id="schema-empty">
          Таблицы не найдены в выбранной базе данных ClickHouse.
        </div>
      )}

      {!loading && !error && schema && schema.tables.length > 0 && (
        <div className="space-y-4" id="schema-tables-list">
          {schema.tables.map((table) => {
            const isExpanded = expandedTable === table.name;
            const isSampleVisible = showSample === table.name;

            return (
              <div key={table.name} className="border border-slate-100 rounded-xl bg-slate-50/20 overflow-hidden">
                <div
                  onClick={() => toggleTable(table.name)}
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50/80 transition-colors select-none"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown size={16} className="text-slate-400" />
                    ) : (
                      <ChevronRight size={16} className="text-slate-400" />
                    )}
                    <span className="font-semibold text-sm text-slate-800 tracking-tight font-mono">{table.name}</span>
                    
                    {table.isEventLog && (
                      <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-semibold rounded-full border border-indigo-100">
                        <Sparkles size={10} />
                        Журнал регистрации 1С
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Hash size={13} />
                      Строк: {table.rowCount?.toLocaleString() || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Columns size={13} />
                      Полей: {table.columns.length}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-white p-4">
                    <div className="flex gap-2 border-b border-slate-100 pb-3 mb-3">
                      <button
                        onClick={() => setShowSample(null)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          !isSampleVisible
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-slate-500 hover:bg-slate-50"
                        }`}
                        id={`cols-tab-${table.name}`}
                      >
                        Список полей
                      </button>
                      <button
                        onClick={() => setShowSample(table.name)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                          isSampleVisible
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-slate-500 hover:bg-slate-50"
                        }`}
                        id={`sample-tab-${table.name}`}
                      >
                        <Eye size={13} />
                        Пример данных (первые 3 строки)
                      </button>
                    </div>

                    {!isSampleVisible ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-600">
                          <thead>
                            <tr className="text-slate-400 font-semibold border-b border-slate-100 pb-2">
                              <th className="py-2 font-medium">Имя поля</th>
                              <th className="py-2 font-medium">Тип данных (ClickHouse)</th>
                              <th className="py-2 font-medium">Описание поля</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 font-mono">
                            {table.columns.map((col) => (
                              <tr key={col.name} className="hover:bg-slate-50/50">
                                <td className="py-2 font-medium text-slate-800">{col.name}</td>
                                <td className="py-2 text-indigo-600 text-[11px]">{col.type}</td>
                                <td className="py-2 text-slate-500 font-sans text-xs">{col.comment || "—"}</td>
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
                          <p className="text-center py-4 text-slate-400 text-xs">Примеры данных отсутствуют.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
