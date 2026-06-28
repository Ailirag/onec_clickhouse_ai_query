import React, { useEffect, useRef, useState } from "react";
import { Sparkles, ChevronRight, ChevronDown, Play, AlertCircle, Code, Database, BarChart3, Star, X, Plus } from "lucide-react";
import { DbSchema, AiConfig, AiSessionState, DialogMessage } from "../types";
import { readJsonResponse } from "../api";
import { toast } from "./Toast";

interface AiQueryInterfaceProps {
  schema: DbSchema | null;
  onRunQuery: (sql: string, question: string) => void;
  onCancelQuery?: () => void;
  loading: boolean;
  aiConfig: AiConfig;
  session: AiSessionState;
  onSessionChange: (session: AiSessionState) => void;
  analyticsEnabled: boolean;
  onAnalyticsToggle: (enabled: boolean) => void;
}

const FAVORITES_KEY = "favorite_questions";
const FAVORITES_COLLAPSED_KEY = "favorites_collapsed";

function pluralizeTables(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  let word = "таблиц";
  if (mod10 === 1 && mod100 !== 11) word = "таблица";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = "таблицы";
  return `${count} ${word}`;
}

function providerLabel(provider: string) {
  return provider === "yandexgpt" ? "YandexGPT" : "Gemini";
}

// Seed list shown on first run; afterwards the user fully controls their favorites.
const DEFAULT_FAVORITES = [
  "Покажи последние 10 зарегистрированных ошибок",
  "Топ-5 пользователей по количеству ошибок и предупреждений",
  "Количество событий по часам за последние 3 дня",
  "Какие фоновые задания завершились с ошибками?",
  "Найди все ошибки блокировок данных (lock errors)",
  "Завершение и начало сеансов пользователей Администратор"
];

export default function AiQueryInterface({
  schema,
  onRunQuery,
  onCancelQuery,
  loading,
  aiConfig,
  session,
  onSessionChange,
  analyticsEnabled,
  onAnalyticsToggle
}: AiQueryInterfaceProps) {
  const DIALOG_STORAGE_KEY = "ai_dialog_messages";
  const [question, setQuestion] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedSql, setGeneratedSql] = useState("");
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<DialogMessage[]>(() => {
    try {
      const saved = localStorage.getItem(DIALOG_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as DialogMessage[]) : [];
    } catch {
      return [];
    }
  });
  const [databaseDraft, setDatabaseDraft] = useState(session.selectedDatabase || "");

  useEffect(() => {
    setDatabaseDraft(session.selectedDatabase || "");
  }, [session.selectedDatabase]);

  // Keep the dialog across reloads so analysts don't lose their context.
  useEffect(() => {
    try {
      localStorage.setItem(DIALOG_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* storage may be unavailable (private mode) — non-fatal */
    }
  }, [messages]);

  const handleClearDialog = () => {
    setMessages([]);
    setGeneratedSql("");
    setExplanation("");
    setError(null);
  };

  // --- Favorites (user-managed, collapsible) ---
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_KEY);
      return saved ? (JSON.parse(saved) as string[]) : DEFAULT_FAVORITES;
    } catch {
      return DEFAULT_FAVORITES;
    }
  });
  const [favoritesCollapsed, setFavoritesCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem(FAVORITES_COLLAPSED_KEY);
    return saved ? saved === "true" : true; // collapsed by default — keeps the dialog compact
  });
  const [managingFavorites, setManagingFavorites] = useState(false);
  const [newFavorite, setNewFavorite] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      /* non-fatal */
    }
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(FAVORITES_COLLAPSED_KEY, String(favoritesCollapsed));
  }, [favoritesCollapsed]);

  const addFavorite = (text: string) => {
    const value = text.trim();
    if (!value) return;
    setFavorites((prev) => (prev.includes(value) ? prev : [...prev, value]));
  };
  const removeFavorite = (text: string) => {
    setFavorites((prev) => prev.filter((item) => item !== text));
  };
  const handleAddNewFavorite = () => {
    const value = newFavorite.trim();
    if (!value) return;
    addFavorite(value);
    setNewFavorite("");
    toast("Вопрос добавлен в избранное");
  };
  const currentIsFavorite = favorites.includes(question.trim());
  const toggleCurrentFavorite = () => {
    const value = question.trim();
    if (!value) return;
    if (currentIsFavorite) {
      removeFavorite(value);
      toast("Убрано из избранного", "info");
    } else {
      addFavorite(value);
      toast("Вопрос добавлен в избранное");
    }
  };

  const addMessage = (message: Omit<DialogMessage, "id">) => {
    setMessages((prev) => [
      ...prev,
      {
        ...message,
        id: `${Date.now()}-${prev.length}`
      }
    ].slice(-12));
  };

  const handleDatabaseChoice = (database: string) => {
    const nextSession = { ...session, selectedDatabase: database };
    onSessionChange(nextSession);
    setDatabaseDraft(database);
    addMessage({ role: "user", content: `Использовать базу ${database}` });
    addMessage({ role: "assistant", content: `Контекст базы зафиксирован: ${database}. Продолжайте диалог или задайте вопрос для SQL-запроса.` });
  };

  const generateAbortRef = useRef<AbortController | null>(null);
  const handleCancelGenerate = () => {
    generateAbortRef.current?.abort();
  };

  const handleGenerateSql = async (qText: string) => {
    if (!qText.trim()) return;
    if (!schema?.tables?.length) {
      setError("Схема ClickHouse пуста. Проверьте подключение и обновите список таблиц перед генерацией SQL.");
      return;
    }
    const controller = new AbortController();
    generateAbortRef.current = controller;
    setGenerating(true);
    setError(null);
    setGeneratedSql("");
    setExplanation("");
    addMessage({ role: "user", content: qText });

    try {
      const token = localStorage.getItem("auth_token") || "";
      const response = await fetch("/api/gemini/generate-sql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          question: qText,
          schema,
          aiConfig,
          session,
          dialog: messages.slice(-8).map((message) => ({
            role: message.role,
            content: message.content,
            sql: message.sql
          }))
        }),
        signal: controller.signal
      });
      const data = await readJsonResponse(response);
      if (data.success) {
        if (data.session) {
          onSessionChange(data.session);
        }

        if (data.action === "select_database") {
          addMessage({
            role: "assistant",
            content: data.message || "Выберите базу данных для этого диалога.",
            options: data.options || []
          });
          return;
        }

        if (data.action === "switch_database") {
          addMessage({
            role: "assistant",
            content: data.message || `Контекст базы переключён на ${data.database}.`
          });
          return;
        }

        setGeneratedSql(data.sql);
        setExplanation(data.explanation);
        addMessage({
          role: "assistant",
          content: data.explanation || "SQL-запрос сгенерирован.",
          sql: data.sql
        });
      } else {
        setError(data.error || "Не удалось сгенерировать SQL-запрос.");
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setError("Генерация SQL отменена.");
      } else {
        setError(`Ошибка: ${err.message || err}`);
      }
    } finally {
      generateAbortRef.current = null;
      setGenerating(false);
    }
  };

  const handleQuickQuestion = (qText: string) => {
    setQuestion(qText);
    handleGenerateSql(qText);
  };

  const handleSubmitQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    handleGenerateSql(question);
  };

  const handleExecute = () => {
    if (!generatedSql.trim()) return;
    onRunQuery(generatedSql, question);
  };

  return (
    <div id="ai-query-interface" className="surface-card rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 bg-brand-50 text-brand-600 rounded-lg">
          <Sparkles size={22} id="ai-icon" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800 tracking-tight font-sans">AI-Терминал Аналитики</h2>
          <p className="text-xs text-slate-500">Задавайте вопросы о работе 1С на естественном русском языке</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 text-xs">
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-center gap-2 text-slate-500 font-semibold mb-2">
            <Database size={14} />
            <span>Контекст запроса</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <input
              list="database-options"
              value={databaseDraft}
              onChange={(event) => setDatabaseDraft(event.target.value)}
              placeholder="Выберите базу"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              id="database-combobox"
            />
            <datalist id="database-options">
              {schema?.databases?.map((database) => (
                <option key={database} value={database} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => databaseDraft.trim() && handleDatabaseChoice(databaseDraft.trim())}
              disabled={!databaseDraft.trim()}
              className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-50"
              id="database-apply-btn"
            >
              Зафиксировать
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span className="px-2 py-1 rounded-md bg-white border border-slate-200">База: {session.selectedDatabase || "не выбрана"}</span>
            <span className="px-2 py-1 rounded-md bg-white border border-slate-200">Схема: {pluralizeTables(schema?.tables?.length || 0)}</span>
            <span className="px-2 py-1 rounded-md bg-white border border-slate-200">Модель: {providerLabel(aiConfig.provider)}</span>
          </div>
        </div>

        <label className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={analyticsEnabled}
            onChange={(event) => onAnalyticsToggle(event.target.checked)}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/20"
            id="analytics-toggle"
          />
          <BarChart3 size={16} className="text-slate-500" />
          <span className="font-semibold text-slate-700">AI-аналитика</span>
          <span className="text-slate-400">{analyticsEnabled ? "вкл" : "выкл"}</span>
        </label>
      </div>

      {messages.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Диалог с моделью</span>
          <button
            type="button"
            onClick={handleClearDialog}
            className="text-[11px] font-medium text-slate-400 hover:text-rose-600 transition-colors"
            id="clear-dialog-btn"
          >
            Очистить диалог
          </button>
        </div>
      )}

      {messages.length > 0 && (
        <div className="mb-5 space-y-2 max-h-64 overflow-y-auto pr-1" id="ai-dialog-messages">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`rounded-xl border p-3 text-xs max-w-[88%] ${
                  message.role === "user"
                    ? "bg-brand-600 border-brand-600 text-white rounded-br-sm"
                    : "bg-slate-50 border-slate-100 text-slate-700 rounded-bl-sm"
                }`}
              >
                <div className={`font-semibold mb-1 ${message.role === "user" ? "text-brand-100" : "text-slate-500"}`}>
                  {message.role === "user" ? "Вы" : "Модель"}
                </div>
                <div className="leading-normal whitespace-pre-wrap">{message.content}</div>
                {message.options && message.options.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                    {message.options.map((database) => (
                      <button
                        key={database}
                        type="button"
                        onClick={() => handleDatabaseChoice(database)}
                        className="px-3 py-1.5 rounded-lg bg-white border border-brand-200 text-brand-700 font-semibold hover:bg-brand-50 transition-colors"
                      >
                        {database}
                      </button>
                    ))}
                  </div>
                )}
                {message.sql && (
                  <pre className="mt-3 p-3 rounded-lg bg-slate-950 text-emerald-400 overflow-x-auto text-[11px]">{message.sql}</pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmitQuestion} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Ваш вопрос к журналу регистрации</label>
          <div className="relative">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full pl-4 pr-28 sm:pr-44 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all placeholder:text-slate-400"
              placeholder="Например: Сколько ошибок совершил Администратор за сегодня?…"
              id="ai-question-input"
              required
            />
            <div className="absolute right-2 top-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleCurrentFavorite}
                disabled={!question.trim()}
                className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${
                  currentIsFavorite
                    ? "text-amber-500 hover:bg-amber-50"
                    : "text-slate-400 hover:text-amber-500 hover:bg-slate-100"
                }`}
                id="favorite-current-btn"
                title={currentIsFavorite ? "Убрать вопрос из избранного" : "Добавить вопрос в избранное"}
                aria-label={currentIsFavorite ? "Убрать вопрос из избранного" : "Добавить вопрос в избранное"}
                aria-pressed={currentIsFavorite}
              >
                <Star size={16} fill={currentIsFavorite ? "currentColor" : "none"} />
              </button>
              {generating ? (
                <button
                  type="button"
                  onClick={handleCancelGenerate}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-semibold tracking-wide transition-colors flex items-center gap-1.5"
                  id="generate-cancel-btn"
                >
                  <div className="w-3.5 h-3.5 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin"></div>
                  Отменить
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading || !question.trim() || !schema?.tables?.length}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-lg text-xs font-semibold tracking-wide transition-colors flex items-center gap-1.5 shadow-sm"
                  id="generate-sql-btn"
                  title={!schema?.tables?.length ? "Обновите схему ClickHouse перед генерацией SQL" : undefined}
                >
                  <Sparkles size={13} />
                  <span className="hidden sm:inline">Создать SQL</span>
                  <span className="sm:hidden">SQL</span>
                </button>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400 leading-normal">
            <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">Enter</kbd> — создать SQL ·
            <Star size={9} className="inline mx-0.5 -mt-0.5 text-amber-500" fill="currentColor" /> — сохранить вопрос в избранное
          </p>
        </div>
      </form>

      {/* Favorites — collapsible & user-managed */}
      <div className="mt-5">
        <button
          type="button"
          onClick={() => setFavoritesCollapsed((value) => !value)}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors"
          id="favorites-toggle"
        >
          <Star size={15} className="text-amber-500" fill="currentColor" />
          <span className="text-xs font-semibold text-slate-700">Избранные вопросы</span>
          <span className="text-[10px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-full px-2 py-0.5">
            {favorites.length}
          </span>
          <span className="flex-1" />
          <span className="text-[11px] text-slate-400">{favoritesCollapsed ? "развернуть" : "свернуть"}</span>
          <ChevronDown size={15} className={`text-slate-400 transition-transform ${favoritesCollapsed ? "" : "rotate-180"}`} />
        </button>

        {!favoritesCollapsed && (
          <div className="mt-3 rounded-xl border border-slate-100 bg-white p-3 animate-fade-in" id="favorites-panel">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {managingFavorites ? "Управление избранным" : "Нажмите, чтобы выполнить"}
              </span>
              <button
                type="button"
                onClick={() => setManagingFavorites((value) => !value)}
                className={`text-[11px] font-semibold transition-colors ${
                  managingFavorites ? "text-emerald-600 hover:text-emerald-700" : "text-brand-600 hover:text-brand-700"
                }`}
                id="favorites-manage-toggle"
              >
                {managingFavorites ? "Готово" : "Управление"}
              </button>
            </div>

            {favorites.length === 0 && (
              <div className="py-5 text-center text-[11px] text-slate-400 border border-dashed border-slate-200 rounded-lg mb-2">
                Список пуст. {managingFavorites ? "Добавьте вопрос ниже." : "Откройте «Управление», чтобы добавить."}
              </div>
            )}

            {!managingFavorites ? (
              favorites.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2" id="favorites-grid">
                  {favorites.map((text, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickQuestion(text)}
                      disabled={generating || loading || !schema?.tables?.length}
                      className="flex items-center gap-2 text-left p-2.5 border border-slate-100 rounded-lg hover:border-brand-200 hover:bg-brand-50/30 transition-all group disabled:opacity-50"
                      id={`favorite-q-${idx}`}
                    >
                      <ChevronRight size={13} className="text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                      <span className="text-xs font-medium text-slate-700 group-hover:text-brand-700 transition-colors line-clamp-2">{text}</span>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-2">
                {favorites.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {favorites.map((text, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 border border-slate-100 rounded-lg bg-slate-50/40">
                        <Star size={13} className="text-amber-500 shrink-0" fill="currentColor" />
                        <span className="text-xs text-slate-700 flex-1 line-clamp-1">{text}</span>
                        <button
                          type="button"
                          onClick={() => removeFavorite(text)}
                          className="text-slate-300 hover:text-rose-600 transition-colors shrink-0"
                          title="Удалить из избранного"
                          aria-label="Удалить из избранного"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    value={newFavorite}
                    onChange={(event) => setNewFavorite(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddNewFavorite();
                      }
                    }}
                    placeholder="Добавить свой вопрос…"
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50/60 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all placeholder:text-slate-400"
                    id="favorite-new-input"
                  />
                  <button
                    type="button"
                    onClick={handleAddNewFavorite}
                    disabled={!newFavorite.trim()}
                    className="px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shrink-0"
                    id="favorite-add-btn"
                  >
                    <Plus size={13} />
                    <span className="hidden sm:inline">В избранное</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 text-xs flex gap-2.5 items-start" id="ai-error">
          <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <span className="leading-normal">{error}</span>
        </div>
      )}

      {/* SQL Code Block and editor */}
      {generatedSql && (
        <div className="mt-6 border border-slate-200 rounded-xl bg-slate-900 overflow-hidden shadow-sm animate-fade-in" id="sql-container">
          <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Code size={14} className="text-brand-400" />
              Сгенерированный SQL-запрос ClickHouse
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <span className="text-[10px] bg-emerald-500/15 text-emerald-300 px-2.5 py-0.5 rounded-full font-semibold border border-emerald-500/10">
                схема проверена
              </span>
              <span className="text-[10px] bg-brand-500/20 text-brand-300 px-2.5 py-0.5 rounded-full font-semibold border border-brand-500/10">
                {session.selectedDatabase || "база не выбрана"}
              </span>
              <span className="text-[10px] bg-slate-700 text-slate-300 px-2.5 py-0.5 rounded-full font-semibold border border-slate-600">
                только чтение
              </span>
            </div>
          </div>

          <div className="p-4">
            <textarea
              value={generatedSql}
              onChange={(e) => setGeneratedSql(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !loading) {
                  e.preventDefault();
                  handleExecute();
                }
              }}
              rows={5}
              className="w-full bg-transparent border-0 p-0 text-emerald-400 font-mono text-xs focus:ring-0 focus:outline-none resize-none leading-relaxed"
              id="sql-textarea"
              spellCheck={false}
            />
          </div>

          {explanation && (
            <div className="bg-slate-950/50 p-4 border-t border-slate-800 text-xs text-slate-400 leading-relaxed">
              <strong className="text-slate-300 block mb-1">Пояснение запроса:</strong>
              {explanation}
            </div>
          )}

          <div className="bg-slate-950/80 px-4 py-3.5 flex items-center justify-between gap-3">
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              {loading
                ? "Запрос может выполняться дольше на больших таблицах…"
                : <>SQL можно редактировать · <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">Ctrl/⌘ + Enter</kbd> — выполнить</>}
            </span>
            {loading ? (
              <button
                onClick={() => onCancelQuery?.()}
                className="px-6 py-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold tracking-wide transition-colors flex items-center gap-2 ml-auto"
                id="execute-cancel-btn"
              >
                <div className="w-3.5 h-3.5 border-2 border-rose-400/40 border-t-rose-300 rounded-full animate-spin"></div>
                Отменить запрос
              </button>
            ) : (
              <button
                onClick={handleExecute}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold tracking-wide transition-colors flex items-center gap-2 shadow-md ml-auto animate-attention"
                id="execute-sql-btn"
              >
                <Play size={13} fill="currentColor" />
                Выполнить запрос в ClickHouse
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
