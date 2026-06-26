import React, { useState, useEffect } from "react";
import { ClickHouseConfig, DbSchema, QueryResult, QueryAnalysis, QueryHistoryItem, AiConfig, UserRole } from "./types";
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
  provider: "gemini",
  geminiModel: "gemini-3.5-flash",
  yandexApiKey: "",
  yandexFolderId: "",
  yandexModel: "yandexgpt/latest"
};

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
  const [config, setConfig] = useState<ClickHouseConfig>(() => {
    return readStoredJson("clickhouse_config", DEFAULT_CONFIG);
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
  const [runningQuery, setRunningQuery] = useState(false);
  const [generatingAnalysis, setGeneratingAnalysis] = useState(false);

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

  // Save config/demo adjustments to localStorage
  useEffect(() => {
    localStorage.setItem("clickhouse_config", JSON.stringify(config));
    localStorage.setItem("is_demo_mode", String(isDemoMode));
    localStorage.setItem("ai_config", JSON.stringify(aiConfig));
  }, [config, isDemoMode, aiConfig]);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem("query_history", JSON.stringify(history));
  }, [history]);

  // Load Schema on mount or config/mode/auth change
  const fetchSchema = async () => {
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
        body: JSON.stringify({ config, isDemo: isDemoMode })
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
  };

  const handleRunQuery = async (sql: string, question: string) => {
    const token = localStorage.getItem("auth_token") || authToken;
    setRunningQuery(true);
    setQueryResult(null);
    setQueryAnalysis(null);
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
          isDemo: isDemoMode
        })
      });

      const result: QueryResult = await readJsonResponse(response);
      setQueryResult(result);
      setRunningQuery(false);

      if (result.success && result.rows && result.rows.length > 0) {
        setGeneratingAnalysis(true);
        // Call Gemini to generate insights and layout recommendations
        const analysisResponse = await fetch("/api/gemini/explain-results", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            question,
            sql,
            resultRows: result.rows,
            columns: result.columns,
            aiConfig
          })
        });

        const analysisData = await readJsonResponse(analysisResponse);
        if (analysisData.success) {
          setQueryAnalysis(analysisData.analysis);

          // Add to history
          const historyItem: QueryHistoryItem = {
            id: String(Date.now()),
            timestamp: new Date().toLocaleTimeString(),
            question,
            sql,
            result,
            analysis: analysisData.analysis
          };
          setHistory((prev) => [historyItem, ...prev].slice(0, 30)); // Keep last 30 items
        }
      }
    } catch (err: any) {
      setQueryResult({
        success: false,
        sql,
        error: `Системная ошибка: ${err.message || err}`,
        elapsedMs: 0
      });
    } finally {
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
      <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin"></div>
          <span className="text-xs font-semibold text-slate-500 font-sans">Проверка авторизации...</span>
        </div>
      </div>
    );
  }

  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center p-4" id="login-container">
        {/* Centered Login Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xl max-w-md w-full animate-scale-in">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="p-3.5 bg-gradient-to-tr from-indigo-600 to-violet-600 text-white rounded-2xl shadow-lg shadow-indigo-100 mb-4">
              <Server size={28} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight font-sans">1С ClickHouse AI Assistant</h2>
            <p className="text-xs text-slate-500 mt-1 font-medium">Интеллектуальный анализатор журналов регистрации 1С:Предприятие</p>
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
                      ? "bg-indigo-600 text-white shadow-sm"
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
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                placeholder="Введите пароль..."
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
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-semibold tracking-wide transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-indigo-100 cursor-pointer"
            >
              {loginLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Вход...</span>
                </>
              ) : (
                <span>Войти в систему</span>
              )}
            </button>
          </form>

          {/* Quick Info about initial passwords */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col gap-1.5 text-[10px] text-slate-400 leading-normal">
            <span className="font-semibold text-slate-500">Пароли по умолчанию для проверки:</span>
            <div className="flex justify-between">
              <span>Пользователь: <strong className="font-mono text-slate-600 font-semibold bg-slate-100 px-1 rounded">user</strong></span>
              <span>Администратор: <strong className="font-mono text-slate-600 font-semibold bg-slate-100 px-1 rounded">admin</strong></span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 font-sans antialiased pb-12" id="app-root">
      {/* Dynamic Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-slate-200/80 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-indigo-600 to-violet-600 text-white rounded-xl shadow-md shadow-indigo-200">
              <Server size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                1С ClickHouse AI Assistant
                <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded border border-slate-200 uppercase tracking-widest font-mono">v1.2</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">Интеллектуальный анализатор журналов регистрации 1С:Предприятие</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3.5">
            {/* Active Session info & Logout */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-xl border border-slate-200 text-xs">
                {userRole === "admin" ? (
                  <Shield size={13} className="text-indigo-600 animate-pulse" />
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
          <ClickHouseConnector
            onConfigChange={handleConfigChange}
            activeConfig={config}
            isDemoMode={isDemoMode}
            role={userRole}
          />

          <AiConfigPanel
            config={aiConfig}
            onConfigChange={setAiConfig}
            role={userRole}
          />

          {/* Admin Password Manager */}
          <AdminPasswordManager role={userRole} />
          
          <DbSchemaBrowser
            schema={dbSchema}
            loading={loadingSchema}
            error={schemaError}
            onRefresh={fetchSchema}
          />
        </section>

        {/* Right column: terminal & logs visualization */}
        <section className="lg:col-span-8 space-y-8">
          <AiQueryInterface
            schema={dbSchema}
            onRunQuery={handleRunQuery}
            loading={runningQuery || generatingAnalysis}
            aiConfig={aiConfig}
          />

          {/* AI Analytics & visualizations */}
          <AnalyticsDashboard
            result={queryResult}
            analysis={queryAnalysis}
            loading={generatingAnalysis}
          />

          {/* Grid table view */}
          <QueryResultViewer
            result={queryResult}
            loading={runningQuery}
          />

          {/* Local history bento */}
          {history.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm" id="history-panel">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <History size={18} className="text-slate-500" />
                  <h3 className="font-semibold text-sm text-slate-800 tracking-tight">История аналитических запросов</h3>
                </div>
                <button
                  onClick={handleClearHistory}
                  className="text-xs font-medium text-slate-400 hover:text-rose-600 transition-colors"
                  id="clear-history-btn"
                >
                  Очистить историю
                </button>
              </div>

              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-2" id="history-list">
                {history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleApplyHistory(item)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 border border-slate-100 rounded-xl hover:border-violet-100 hover:bg-violet-50/10 cursor-pointer group transition-all"
                  >
                    <div className="flex items-start gap-2.5">
                      <Clock size={13} className="text-slate-400 mt-1 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-slate-700 group-hover:text-violet-700 transition-colors line-clamp-1">
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
                  </div>
                ))}
              </div>
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
