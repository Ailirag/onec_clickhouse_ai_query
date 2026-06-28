import React, { useState, useEffect, useRef } from "react";
import { ClickHouseConfig, DbSchema, QueryResult, QueryAnalysis, QueryHistoryItem, AiConfig, UserRole, AiSessionState } from "./types";
import ClickHouseConnector from "./components/ClickHouseConnector";
import DbSchemaBrowser from "./components/DbSchemaBrowser";
import AiQueryInterface from "./components/AiQueryInterface";
import QueryResultViewer from "./components/QueryResultViewer";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import AiConfigPanel from "./components/AiConfigPanel";
import ServerInstructionsModal from "./components/ServerInstructionsModal";
import AdminPasswordManager from "./components/AdminPasswordManager";
import { Server, Sparkles, History, Clock, ChevronRight, CornerDownRight, Database, HelpCircle, User, Shield, Lock, Unlock, KeyRound, X, LogOut, AlertCircle } from "lucide-react";
import { readJsonResponse } from "./api";

const DEFAULT_CONFIG: ClickHouseConfig = {
  host: "localhost",
  port: 8123,
  username: "default",
  password: "",
  database: "default",
  useHttps: false
};

const DEFAULT_AI_CONFIG: AiConfig = {
  provider: "yandexgpt",
  geminiModel: "gemini-2.5-flash",
  yandexApiKey: "",
  yandexFolderId: "",
  yandexModel: "yandexgpt/latest",
  systemPrompt: ""
};

const SESSION_COOKIE = "onec_ai_session";

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const value = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${name}=`))
    ?.split("=")[1];
  return value ? decodeURIComponent(value) : null;
}

function writeCookie(name: string, value: string, maxAgeSeconds = 60 * 60 * 24 * 30) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

function readSessionCookie(): AiSessionState {
  const saved = readCookie(SESSION_COOKIE);
  if (!saved) return {};

  try {
    return JSON.parse(saved) as AiSessionState;
  } catch {
    writeCookie(SESSION_COOKIE, "", 0);
    return {};
  }
}

function readStoredJson<T>(key: string, fallback: T): T {
  const saved = localStorage.getItem(key);
  if (!saved) return fallback;

  try {
    return JSON.parse(saved) as T;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

export default function App() {
  const [aiSession, setAiSession] = useState<AiSessionState>(() => readSessionCookie());

  const [config, setConfig] = useState<ClickHouseConfig>(() => {
    const saved = readStoredJson("clickhouse_config", DEFAULT_CONFIG);
    const session = readSessionCookie();
    return {
      ...saved,
      database: session.selectedDatabase ?? saved.database ?? ""
    };
  });

  const [aiConfig, setAiConfig] = useState<AiConfig>(() => {
    return readStoredJson("ai_config", DEFAULT_AI_CONFIG);
  });

  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("is_demo_mode");
    return saved ? saved === "true" : true;
  });

  const [userRole, setUserRole] = useState<UserRole>("user");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Login form state
  const [loginRole, setLoginRole] = useState<UserRole>("user");
  const [loginPasswordInput, setLoginPasswordInput] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [showInstructionsModal, setShowInstructionsModal] = useState(false);

  const [dbSchema, setDbSchema] = useState<DbSchema | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryAnalysis, setQueryAnalysis] = useState<QueryAnalysis | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [runningQuery, setRunningQuery] = useState(false);
  const [generatingAnalysis, setGeneratingAnalysis] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("analytics_enabled");
    return saved === "true";
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [history, setHistory] = useState<QueryHistoryItem[]>(() => {
    return readStoredJson("query_history", []);
  });

  // Verify stored token on startup
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const role = localStorage.getItem("user_role");
    if (token && role) {
      fetch("/api/auth/verify", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      })
      .then((res) => {
        if (res.ok) return readJsonResponse(res);
        throw new Error();
      })
      .then((data) => {
        if (data.success) {
          setAuthToken(token);
          setUserRole(data.role);
          setIsAuthenticated(true);
        } else {
          handleLogout();
        }
      })
      .catch(() => {
        handleLogout();
      });
    } else {
      setIsAuthenticated(false);
    }
  }, []);

  // Save config/demo adjustments to localStorage.
  // The ClickHouse password is intentionally NOT persisted — it stays in memory
  // for the session only and is re-entered by the admin after a reload.
  useEffect(() => {
    const { password, ...configWithoutPassword } = config;
    localStorage.setItem("clickhouse_config", JSON.stringify(configWithoutPassword));
    localStorage.setItem("is_demo_mode", String(isDemoMode));
    localStorage.setItem("ai_config", JSON.stringify(aiConfig));
  }, [config, isDemoMode, aiConfig]);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem("query_history", JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem("analytics_enabled", String(analyticsEnabled));
  }, [analyticsEnabled]);

  useEffect(() => {
    writeCookie(SESSION_COOKIE, JSON.stringify(aiSession));
  }, [aiSession]);

  // Load Schema on mount or config/mode/auth change
  const fetchSchema = async (
    overrideConfig: ClickHouseConfig = config,
    overrideIsDemo: boolean = isDemoMode
  ) => {
    const token = localStorage.getItem("auth_token") || authToken;
    if (!token || !isAuthenticated) return;

    setLoadingSchema(true);
    setSchemaError(null);
    try {
      const response = await fetch("/api/clickhouse/schema", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ config: overrideConfig, isDemo: overrideIsDemo })
      });
      const data = await readJsonResponse(response);
      if (data.success) {
        setDbSchema(data.schema);
      } else {
        setSchemaError(data.error || "Не удалось загрузить схему БД ClickHouse.");
      }
    } catch (err: any) {
      setSchemaError(`Ошибка соединения: ${err.message || err}`);
    } finally {
      setLoadingSchema(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchSchema();
    }
  }, [isDemoMode, isAuthenticated]);

  const handleConfigChange = (newConfig: ClickHouseConfig, demo: boolean) => {
    setConfig(newConfig);
    setIsDemoMode(demo);
    setAiSession((prev) => {
      const database = newConfig.database.trim();
      if (database === (prev.selectedDatabase || "")) return prev;
      return {
        ...prev,
        selectedDatabase: database || undefined
      };
    });
  };

  const handleConnectionVerified = (verifiedConfig: ClickHouseConfig, demo: boolean) => {
    setConfig(verifiedConfig);
    setIsDemoMode(demo);
    fetchSchema(verifiedConfig, demo);
  };

  const handleAiSessionChange = (nextSession: AiSessionState) => {
    setAiSession(nextSession);
    if (nextSession.selectedDatabase && nextSession.selectedDatabase !== config.database) {
      const nextConfig = { ...config, database: nextSession.selectedDatabase };
      setConfig(nextConfig);
      fetchSchema(nextConfig, isDemoMode);
    }
  };

  const runAbortRef = useRef<AbortController | null>(null);
  const resultsAnchorRef = useRef<HTMLDivElement | null>(null);

  // Bring the results into view once a query starts/finishes, so the user
  // doesn't have to scroll past the (now compact) query panel manually.
  useEffect(() => {
    if (queryResult || runningQuery) {
      resultsAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [queryResult, runningQuery]);

  const handleCancelQuery = () => {
    runAbortRef.current?.abort();
  };

  const handleRunQuery = async (sql: string, question: string) => {
    const token = localStorage.getItem("auth_token") || authToken;
    const controller = new AbortController();
    runAbortRef.current = controller;
    setRunningQuery(true);
    setQueryResult(null);
    setQueryAnalysis(null);
    setCurrentQuestion(question);
    setGeneratingAnalysis(false);

    try {
      const response = await fetch("/api/clickhouse/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          config,
          query: sql,
          isDemo: isDemoMode,
          question,
          schema: dbSchema,
          aiConfig
        }),
        signal: controller.signal
      });

      const result: QueryResult = await readJsonResponse(response);
      setQueryResult(result);
      setRunningQuery(false);

      if (result.success && result.rows && result.rows.length > 0 && analyticsEnabled) {
        setGeneratingAnalysis(true);
        // Call the AI provider to generate insights and layout recommendations
        const analysisResponse = await fetch("/api/gemini/explain-results", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            question,
            sql: result.sql || sql,
            resultRows: result.rows,
            columns: result.columns,
            aiConfig
          }),
          signal: controller.signal
        });

        const analysisData = await readJsonResponse(analysisResponse);
        const analysis = analysisData.success ? analysisData.analysis : undefined;
        if (analysis) setQueryAnalysis(analysis);
        const historyItem: QueryHistoryItem = {
          id: String(Date.now()),
          timestamp: new Date().toLocaleTimeString(),
          question,
          sql: result.sql || sql,
          result,
          analysis
        };
        setHistory((prev) => [historyItem, ...prev].slice(0, 30)); // Keep last 30 items
      } else if (result.success) {
        const historyItem: QueryHistoryItem = {
          id: String(Date.now()),
          timestamp: new Date().toLocaleTimeString(),
          question,
          sql: result.sql || sql,
          result
        };
        setHistory((prev) => [historyItem, ...prev].slice(0, 30));
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setQueryResult({
          success: false,
          sql,
          error: "Запрос отменён пользователем.",
          elapsedMs: 0
        });
      } else {
        setQueryResult({
          success: false,
          sql,
          error: `Системная ошибка: ${err.message || err}`,
          elapsedMs: 0
        });
      }
    } finally {
      runAbortRef.current = null;
      setRunningQuery(false);
      setGeneratingAnalysis(false);
    }
  };

  const handleApplyHistory = (item: QueryHistoryItem) => {
    setQueryResult(item.result || null);
    setQueryAnalysis(item.analysis || null);
  };

  const handleClearHistory = () => {
    setHistory([]);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: loginRole, password: loginPasswordInput })
      });
      const data = await readJsonResponse(response);
      if (response.ok && data.success) {
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("user_role", data.role);
        setAuthToken(data.token);
        setUserRole(data.role);
        setIsAuthenticated(true);
        setLoginPasswordInput("");
      } else {
        setLoginError(data.error || "Неверный пароль.");
      }
    } catch (err: any) {
      setLoginError(`Ошибка соединения: ${err.message || err}`);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user_role");
    setAuthToken(null);
    setUserRole("user");
    setIsAuthenticated(false);
    setQueryResult(null);
    setQueryAnalysis(null);
  };

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-[3px] border-brand-200/60 border-t-brand-500 rounded-full animate-spin"></div>
          <span className="text-xs font-semibold text-slate-500 font-sans">Проверка авторизации…</span>
        </div>
      </div>
    );
  }

  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" id="login-container">
        {/* Centered Login Card */}
        <div className="surface-card rounded-3xl p-8 max-w-md w-full animate-scale-in">
          <div className="flex flex-col items-center text-center mb-7">
            <div className="p-3.5 bg-gradient-to-br from-brand-500 to-violet-500 text-white rounded-2xl shadow-lg shadow-brand-200/50 mb-4">
              <Server size={28} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight font-sans">1С ClickHouse AI Assistant</h2>
            <p className="text-xs text-slate-500 mt-1.5 font-medium leading-relaxed">Интеллектуальный анализатор журналов регистрации 1С:Предприятие</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-5">
            {/* Role selection tab */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider">
                Выберите роль
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setLoginRole("user");
                    setLoginError("");
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                    loginRole === "user"
                      ? "bg-white text-slate-800 shadow-sm border border-slate-200/50"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <User size={14} />
                  <span>Пользователь</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginRole("admin");
                    setLoginError("");
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                    loginRole === "admin"
                      ? "bg-brand-500 text-white shadow-sm shadow-brand-200/60"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Shield size={14} />
                  <span>Администратор</span>
                </button>
              </div>
            </div>

            {/* Role Info Box */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-500 leading-normal">
              {loginRole === "admin" ? (
                <span><strong>Роль Администратора:</strong> Полный доступ к настройкам соединения ClickHouse, выбору AI моделей (Gemini/YandexGPT) и управлению паролями.</span>
              ) : (
                <span><strong>Роль Пользователя:</strong> Доступ к ИИ-интерфейсу для выполнения SQL-запросов и аналитики. Настройки закрыты для редактирования.</span>
              )}
            </div>

            {/* Password input */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                Пароль
              </label>
              <input
                type="password"
                value={loginPasswordInput}
                onChange={(e) => {
                  setLoginPasswordInput(e.target.value);
                  setLoginError("");
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/15 focus:border-brand-400 transition-all placeholder:text-slate-400"
                placeholder="Введите пароль…"
                required
                autoFocus
              />
            </div>

            {loginError && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 text-xs flex gap-2 items-start" id="login-error">
                <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-normal">{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white rounded-xl text-xs font-semibold tracking-wide transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-brand-200/50 cursor-pointer"
            >
              {loginLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Вход…</span>
                </>
              ) : (
                <span>Войти в систему</span>
              )}
            </button>
          </form>

          <p className="mt-6 pt-5 border-t border-slate-100 text-[10px] text-slate-400 leading-relaxed text-center">
            Доступ к системе предоставляется администратором. Реквизиты подключения и AI-провайдеры
            настраиваются после входа под ролью администратора.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-800 font-sans antialiased pb-12" id="app-root">
      {/* Dynamic Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-white/60 px-6 py-4 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-brand-500 to-violet-500 text-white rounded-2xl shadow-md shadow-brand-200/60">
              <Server size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                1С ClickHouse AI Assistant
                <span className="text-[10px] bg-brand-50 text-brand-600 font-bold px-2 py-0.5 rounded-md border border-brand-100 uppercase tracking-widest font-mono">v1.2</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">Интеллектуальный анализатор журналов регистрации 1С:Предприятие</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3.5">
            {/* Active Session info & Logout */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/70 rounded-xl border border-slate-200/80 text-xs">
                {userRole === "admin" ? (
                  <Shield size={13} className="text-brand-500" />
                ) : (
                  <User size={13} className="text-slate-600" />
                )}
                <span className="font-semibold text-slate-700">
                  {userRole === "admin" ? "Администратор" : "Пользователь"}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-xl text-xs font-semibold border border-transparent hover:border-rose-200 transition-all cursor-pointer"
                title="Выйти из аккаунта"
                aria-label="Выйти из аккаунта"
                id="logout-btn"
              >
                <LogOut size={13} />
                <span>Выйти</span>
              </button>
            </div>

            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
              isDemoMode 
                ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                : "bg-blue-50 text-blue-700 border border-blue-100"
            }`}>
              <span className={`w-2 h-2 rounded-full ${isDemoMode ? "bg-emerald-500" : "bg-blue-500"}`}></span>
              {isDemoMode ? "Демо-база журналов" : "Подключен ClickHouse"}
            </div>

            {/* Instruction manual button */}
            <button
              onClick={() => setShowInstructionsModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-xl text-xs font-semibold border border-slate-200 transition-all cursor-pointer shadow-sm"
              title="Инструкция по развертыванию сервера"
              id="server-docs-btn"
            >
              <HelpCircle size={14} className="text-slate-500" />
              <span>Инструкция по поднятию</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left column: Setup & Catalog browser */}
        <section className="lg:col-span-4 space-y-8">
          {/* Settings are admin-only — completely hidden for the user role */}
          {userRole === "admin" && (
            <>
              <button
                type="button"
                onClick={() => setSettingsOpen((open) => !open)}
                className="w-full surface-card rounded-2xl px-5 py-4 flex items-center justify-between text-left hover:bg-white transition-colors"
                id="settings-toggle"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-800">Подключение и настройки AI</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {isDemoMode ? "Демо-режим" : `ClickHouse / ${config.database || "база не выбрана"} / ${aiConfig.provider}`}
                  </div>
                </div>
                <ChevronRight size={16} className={`text-slate-400 transition-transform ${settingsOpen ? "rotate-90" : ""}`} />
              </button>

              {settingsOpen && (
                <>
                  <ClickHouseConnector
                    onConfigChange={handleConfigChange}
                    onConnectionVerified={handleConnectionVerified}
                    activeConfig={config}
                    isDemoMode={isDemoMode}
                    role={userRole}
                  />

                  <AiConfigPanel
                    config={aiConfig}
                    onConfigChange={setAiConfig}
                    role={userRole}
                  />

                  <AdminPasswordManager role={userRole} />
                </>
              )}
            </>
          )}

          <DbSchemaBrowser
            schema={dbSchema}
            loading={loadingSchema}
            error={schemaError}
            onRefresh={() => fetchSchema()}
          />
        </section>

        {/* Right column: terminal & logs visualization */}
        <section className="lg:col-span-8 space-y-8">
          <AiQueryInterface
            schema={dbSchema}
            onRunQuery={handleRunQuery}
            onCancelQuery={handleCancelQuery}
            loading={runningQuery || generatingAnalysis}
            aiConfig={aiConfig}
            session={aiSession}
            onSessionChange={handleAiSessionChange}
            analyticsEnabled={analyticsEnabled}
            onAnalyticsToggle={setAnalyticsEnabled}
          />

          {/* Scroll anchor — results come into view here after a query */}
          <div ref={resultsAnchorRef} className="scroll-mt-24" />

          {/* AI Analytics & visualizations */}
          {analyticsEnabled && (
            <AnalyticsDashboard
              result={queryResult}
              analysis={queryAnalysis}
              loading={generatingAnalysis}
            />
          )}

          {/* Grid table view */}
          <QueryResultViewer
            result={queryResult}
            loading={runningQuery}
            question={currentQuestion}
            isDemo={isDemoMode}
          />

          {/* Local history bento (collapsible) */}
          {history.length > 0 && (
            <div className="surface-card rounded-2xl p-6" id="history-panel">
              <div className="flex items-center justify-between mb-1">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((open) => !open)}
                  className="flex items-center gap-2.5 text-left focus:outline-none focus:ring-2 focus:ring-brand-500/20 rounded-lg"
                  id="history-toggle"
                  aria-expanded={historyOpen}
                >
                  <History size={18} className="text-slate-500" />
                  <h3 className="font-semibold text-sm text-slate-800 tracking-tight">История аналитических запросов</h3>
                  <span className="text-[10px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-full px-2 py-0.5">
                    {history.length}
                  </span>
                  <ChevronRight size={15} className={`text-slate-400 transition-transform ${historyOpen ? "rotate-90" : ""}`} />
                </button>
                {historyOpen && (
                  <button
                    onClick={handleClearHistory}
                    className="text-xs font-medium text-slate-400 hover:text-rose-600 transition-colors"
                    id="clear-history-btn"
                  >
                    Очистить историю
                  </button>
                )}
              </div>

              {historyOpen && (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-2 mt-4" id="history-list">
                {history.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => handleApplyHistory(item)}
                    className="w-full text-left flex flex-col sm:flex-row sm:items-center justify-between p-3.5 border border-slate-100 rounded-xl hover:border-brand-200 hover:bg-brand-50/40 focus:outline-none focus:ring-2 focus:ring-brand-500/20 cursor-pointer group transition-all"
                  >
                    <div className="flex items-start gap-2.5">
                      <Clock size={13} className="text-slate-400 mt-1 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-slate-700 group-hover:text-brand-700 transition-colors line-clamp-1">
                          {item.question}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <CornerDownRight size={10} className="text-slate-300" />
                          <code className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded max-w-[250px] truncate">
                            {item.sql}
                          </code>
                        </div>
                      </div>
                    </div>
                    
                    <span className="text-[10px] text-slate-400 font-medium sm:text-right shrink-0 mt-2 sm:mt-0 font-mono">
                      {item.timestamp}
                    </span>
                  </button>
                ))}
              </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Deployment & Setup Instructions Modal */}
      <ServerInstructionsModal
        isOpen={showInstructionsModal}
        onClose={() => setShowInstructionsModal(false)}
      />
    </div>
  );
}
