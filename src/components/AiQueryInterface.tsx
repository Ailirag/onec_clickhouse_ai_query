import React, { useState } from "react";
import { Sparkles, Terminal, ChevronRight, Play, AlertCircle, HelpCircle, Code } from "lucide-react";
import { DbSchema, AiConfig, AiSessionState, DialogMessage } from "../types";
import { readJsonResponse } from "../api";

interface AiQueryInterfaceProps {
  schema: DbSchema | null;
  onRunQuery: (sql: string, question: string) => void;
  loading: boolean;
  aiConfig: AiConfig;
  session: AiSessionState;
  onSessionChange: (session: AiSessionState) => void;
}

const QUICK_QUESTIONS = [
  {
    text: "Покажи последние 10 зарегистрированных ошибок",
    desc: "Поиск системных сбоев 1С с уровнем 'Ошибка'"
  },
  {
    text: "Топ-5 пользователей по количеству ошибок и предупреждений",
    desc: "Выявление наиболее проблемных пользователей или фоновых заданий"
  },
  {
    text: "Количество событий по часам за последние 3 дня",
    desc: "Анализ суточной активности и пиковой нагрузки на систему"
  },
  {
    text: "Какие фоновые задания завершились с ошибками?",
    desc: "Мониторинг стабильности регламентных фоновых процедур 1С"
  },
  {
    text: "Найди все ошибки блокировок данных (lock errors)",
    desc: "Поиск конфликтов блокировок транзакций в СУБД/1С"
  },
  {
    text: "Завершение и начало сеансов пользователей Администратор",
    desc: "История сеансов административного персонала в журнале"
  }
];

export default function AiQueryInterface({
  schema,
  onRunQuery,
  loading,
  aiConfig,
  session,
  onSessionChange
}: AiQueryInterfaceProps) {
  const [question, setQuestion] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedSql, setGeneratedSql] = useState("");
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<DialogMessage[]>([]);

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
    addMessage({ role: "user", content: `Use database ${database}` });
    addMessage({ role: "assistant", content: `Database context fixed: ${database}. Continue the dialog or ask for a query.` });
  };

  const handleGenerateSql = async (qText: string) => {
    if (!qText.trim()) return;
    if (!schema?.tables?.length) {
      setError("ClickHouse schema is empty. Check the connection and refresh the table list before generating SQL.");
      return;
    }
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
        })
      });
      const data = await readJsonResponse(response);
      if (data.success) {
        if (data.session) {
          onSessionChange(data.session);
        }

        if (data.action === "select_database") {
          addMessage({
            role: "assistant",
            content: data.message || "Choose a database for this dialog.",
            options: data.options || []
          });
          return;
        }

        if (data.action === "switch_database") {
          addMessage({
            role: "assistant",
            content: data.message || `Switched database context to ${data.database}.`
          });
          return;
        }

        setGeneratedSql(data.sql);
        setExplanation(data.explanation);
        addMessage({
          role: "assistant",
          content: data.explanation || "SQL generated.",
          sql: data.sql
        });
      } else {
        setError(data.error || "Не удалось сгенерировать SQL-запрос.");
      }
    } catch (err: any) {
      setError(`Ошибка: ${err.message || err}`);
    } finally {
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
    <div id="ai-query-interface" className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 bg-violet-50 text-violet-600 rounded-lg">
          <Sparkles size={22} id="ai-icon" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800 tracking-tight font-sans">AI-Терминал Аналитики</h2>
          <p className="text-xs text-slate-500">Задавайте вопросы о работе 1С на естественном русском языке</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">
          DB: {session.selectedDatabase || "not selected"}
        </span>
        {schema?.databases?.map((database) => (
          <button
            key={database}
            type="button"
            onClick={() => handleDatabaseChoice(database)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
              session.selectedDatabase === database
                ? "bg-violet-50 text-violet-700 border-violet-200"
                : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {database}
          </button>
        ))}
      </div>

      {messages.length > 0 && (
        <div className="mb-5 space-y-2 max-h-64 overflow-y-auto pr-1" id="ai-dialog-messages">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-xl border p-3 text-xs ${
                message.role === "user"
                  ? "bg-slate-50 border-slate-100 text-slate-700"
                  : "bg-violet-50/60 border-violet-100 text-slate-700"
              }`}
            >
              <div className="font-semibold mb-1 text-slate-500">{message.role === "user" ? "You" : "Assistant"}</div>
              <div className="leading-normal whitespace-pre-wrap">{message.content}</div>
              {message.options && message.options.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.options.map((database) => (
                    <button
                      key={database}
                      type="button"
                      onClick={() => handleDatabaseChoice(database)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-violet-200 text-violet-700 font-semibold hover:bg-violet-50 transition-colors"
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
              className="w-full pl-4 pr-32 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all placeholder:text-slate-400"
              placeholder="Например: Сколько ошибок совершил Администратор за сегодня?..."
              id="ai-question-input"
              required
            />
            <button
              type="submit"
              disabled={generating || loading || !question.trim() || !schema?.tables?.length}
              className="absolute right-2 top-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-lg text-xs font-semibold tracking-wide transition-colors flex items-center gap-1.5 shadow-sm"
              id="generate-sql-btn"
              title={!schema?.tables?.length ? "Refresh ClickHouse schema before generating SQL" : undefined}
            >
              {generating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Думаю...
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  Создать SQL
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Quick suggestions bento */}
      <div className="mt-5">
        <span className="block text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wider flex items-center gap-1.5">
          <HelpCircle size={13} />
          Популярные вопросы для анализа журнала 1С
        </span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="quick-questions-grid">
          {QUICK_QUESTIONS.map((item, idx) => (
            <button
              key={idx}
              onClick={() => handleQuickQuestion(item.text)}
              disabled={generating || loading || !schema?.tables?.length}
              className="flex flex-col items-start text-left p-3 border border-slate-100 rounded-xl hover:border-violet-200 hover:bg-violet-50/10 transition-all group disabled:opacity-50"
              id={`quick-q-${idx}`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 group-hover:text-violet-700 transition-colors">
                <ChevronRight size={13} className="text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                {item.text}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 pl-4 leading-normal">{item.desc}</span>
            </button>
          ))}
        </div>
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
              <Code size={14} className="text-violet-400" />
              Сгенерированный SQL-запрос ClickHouse
            </div>
            <span className="text-[10px] bg-violet-500/20 text-violet-300 px-2.5 py-0.5 rounded-full font-semibold border border-violet-500/10">
              Свободно редактируемый
            </span>
          </div>

          <div className="p-4">
            <textarea
              value={generatedSql}
              onChange={(e) => setGeneratedSql(e.target.value)}
              rows={5}
              className="w-full bg-transparent border-0 p-0 text-emerald-400 font-mono text-xs focus:ring-0 focus:outline-none resize-none leading-relaxed"
              id="sql-textarea"
            />
          </div>

          {explanation && (
            <div className="bg-slate-950/50 p-4 border-t border-slate-800 text-xs text-slate-400 leading-relaxed">
              <strong className="text-slate-300 block mb-1">Пояснение запроса:</strong>
              {explanation}
            </div>
          )}

          <div className="bg-slate-950/80 px-4 py-3.5 flex justify-end">
            <button
              onClick={handleExecute}
              disabled={loading}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold tracking-wide transition-colors flex items-center gap-2 shadow-md disabled:bg-slate-800 disabled:text-slate-500"
              id="execute-sql-btn"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-white rounded-full animate-spin"></div>
                  Выполняю...
                </>
              ) : (
                <>
                  <Play size={13} fill="currentColor" />
                  Выполнить запрос в ClickHouse
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
