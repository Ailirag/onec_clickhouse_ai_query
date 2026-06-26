import React, { useState, useEffect } from "react";
import { AiConfig, UserRole } from "../types";
import { Sliders, Sparkles, Key, Folder, CheckCircle, BrainCircuit, Lock, Eye } from "lucide-react";

interface AiConfigPanelProps {
  config: AiConfig;
  onConfigChange: (config: AiConfig) => void;
  role: UserRole;
}

const GEMINI_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Рекомендуется)" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (Точная)" },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (Быстрая)" }
];

const YANDEX_MODELS = [
  { id: "yandexgpt/latest", name: "YandexGPT 3 Pro (Основная)" },
  { id: "yandexgpt-lite/latest", name: "YandexGPT 3 Lite (Быстрая)" },
  { id: "yandexgpt/prestable", name: "YandexGPT Prestable (Тестовая)" },
  { id: "deepseek-v4-flash/latest", name: "DeepSeek V4 Flash (Responses API)" },
  { id: "gpt-oss-120b/latest", name: "GPT OSS 120B (Responses API)" },
  { id: "custom", name: "Указать свой Model URI (Кастомный)" }
];

export default function AiConfigPanel({ config, onConfigChange, role }: AiConfigPanelProps) {
  const [provider, setProvider] = useState<"gemini" | "yandexgpt">(config.provider);
  const [geminiModel, setGeminiModel] = useState(config.geminiModel);
  const [yandexApiKey, setYandexApiKey] = useState(config.yandexApiKey);
  const [yandexFolderId, setYandexFolderId] = useState(config.yandexFolderId);
  const [yandexModel, setYandexModel] = useState(config.yandexModel);
  const [systemPrompt, setSystemPrompt] = useState(config.systemPrompt || "");
  const [customYandexUri, setCustomYandexUri] = useState(
    YANDEX_MODELS.some(m => m.id === config.yandexModel) ? "" : config.yandexModel
  );

  const [savedStatus, setSavedStatus] = useState(false);

  // Keep internal state in sync with prop updates if role/config changes
  useEffect(() => {
    setProvider(config.provider);
    setGeminiModel(config.geminiModel);
    setYandexApiKey(config.yandexApiKey);
    setYandexFolderId(config.yandexFolderId);
    setSystemPrompt(config.systemPrompt || "");
    
    const isPredefined = YANDEX_MODELS.some(m => m.id === config.yandexModel);
    if (isPredefined) {
      setYandexModel(config.yandexModel);
      setCustomYandexUri("");
    } else {
      setYandexModel("custom");
      setCustomYandexUri(config.yandexModel);
    }
  }, [config]);

  useEffect(() => {
    // Only trigger changes if user is admin
    if (role === "admin") {
      const finalModel = yandexModel === "custom" ? customYandexUri : yandexModel;
      onConfigChange({
        provider,
        geminiModel,
        yandexApiKey,
        yandexFolderId,
        yandexModel: finalModel,
        systemPrompt
      });
    }
  }, [provider, geminiModel, yandexApiKey, yandexFolderId, yandexModel, customYandexUri, systemPrompt, role]);

  const handleSaveNotification = () => {
    if (role === "admin") {
      setSavedStatus(true);
      setTimeout(() => setSavedStatus(false), 2000);
    }
  };

  const isLocked = role === "user";

  return (
    <div id="ai-config-panel" className="surface-card rounded-2xl p-6 shadow-sm transition-all">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand-50 text-brand-600 rounded-lg">
            <BrainCircuit size={22} id="ai-config-icon" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800 tracking-tight flex items-center gap-2">
              Настройки AI
              {isLocked ? (
                <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 font-semibold font-sans">
                  <Lock size={10} /> Только чтение
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 font-semibold font-sans">
                  Редактирование
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500">Выберите и настройте нейросеть для генерации SQL и аналитики</p>
          </div>
        </div>
      </div>

      {/* Role Restriction Banner */}
      {isLocked ? (
        <div className="mb-5 p-3 bg-amber-50/80 border border-amber-200/60 rounded-xl flex items-start gap-2.5 text-amber-800 text-xs leading-normal animate-fade-in" id="ai-config-locked-notice">
          <Lock size={15} className="mt-0.5 text-amber-600 shrink-0" />
          <div>
            <span className="font-semibold">Просмотр настроек ограничен</span>
            <p className="mt-0.5 text-amber-700/90">Изменение настроек доступно только администраторам. Вы можете переключить роль в шапке сайта.</p>
          </div>
        </div>
      ) : (
        <div className="mb-5 p-3 bg-emerald-50/80 border border-emerald-200/60 rounded-xl flex items-start gap-2.5 text-emerald-800 text-xs leading-normal animate-fade-in" id="ai-config-unlocked-notice">
          <CheckCircle size={15} className="mt-0.5 text-emerald-600 shrink-0" />
          <div>
            <span className="font-semibold">Панель разблокирована</span>
            <p className="mt-0.5 text-emerald-700/90">Вы вошли как Администратор. Настройки провайдера сохраняются автоматически.</p>
          </div>
        </div>
      )}

      {/* Provider Selector tabs */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg mb-5">
        <button
          type="button"
          disabled={isLocked}
          onClick={() => {
            setProvider("gemini");
            handleSaveNotification();
          }}
          className={`py-2 text-xs font-semibold rounded-md transition-all ${
            isLocked ? "cursor-not-allowed opacity-80" : "cursor-pointer"
          } ${
            provider === "gemini"
              ? "bg-white text-brand-700 shadow-sm"
              : "text-slate-500 hover:text-slate-800"
          }`}
          id="provider-gemini-btn"
        >
          Google Gemini
        </button>
        <button
          type="button"
          disabled={isLocked}
          onClick={() => {
            setProvider("yandexgpt");
            handleSaveNotification();
          }}
          className={`py-2 text-xs font-semibold rounded-md transition-all ${
            isLocked ? "cursor-not-allowed opacity-80" : "cursor-pointer"
          } ${
            provider === "yandexgpt"
              ? "bg-white text-brand-700 shadow-sm"
              : "text-slate-500 hover:text-slate-800"
          }`}
          id="provider-yandex-btn"
        >
          YandexGPT
        </button>
      </div>

      <div className="mb-5">
        <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
          Общий системный промт
        </label>
        <textarea
          value={systemPrompt}
          disabled={isLocked}
          onChange={(e) => {
            setSystemPrompt(e.target.value);
            handleSaveNotification();
          }}
          rows={5}
          className={`w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50/50 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all placeholder:text-slate-400 resize-y ${
            isLocked ? "opacity-75 cursor-not-allowed bg-slate-100" : ""
          }`}
          placeholder="Дополнительные инструкции для генерации SQL, исправления запросов и аналитики. Например: использовать только выбранную базу, отдавать короткие LIMIT-запросы, явно пояснять допущения."
          id="global-system-prompt-input"
        />
        <p className="text-[10px] text-slate-400 mt-1 leading-normal">
          Применяется к генерации SQL, автоматическому исправлению запроса и аналитике результата.
        </p>
      </div>

      {/* Gemini Settings */}
      {provider === "gemini" && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Модель Gemini</label>
            <select
              value={geminiModel}
              disabled={isLocked}
              onChange={(e) => {
                setGeminiModel(e.target.value);
                handleSaveNotification();
              }}
              className={`w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${
                isLocked ? "opacity-75 cursor-not-allowed bg-slate-100" : ""
              }`}
              id="gemini-model-select"
            >
              {GEMINI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-xl text-slate-500 text-xs leading-normal">
            Используется встроенный ключ <strong>GEMINI_API_KEY</strong> из переменных окружения. Настройка на стороне клиента не требуется.
          </div>
        </div>
      )}

      {/* YandexGPT Settings */}
      {provider === "yandexgpt" && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
              <Key size={12} className="text-slate-400" />
              API-ключ Yandex Cloud
            </label>
            <input
              type="password"
              value={yandexApiKey}
              disabled={isLocked}
              onChange={(e) => {
                setYandexApiKey(e.target.value);
                handleSaveNotification();
              }}
              className={`w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all placeholder:text-slate-400 ${
                isLocked ? "opacity-75 cursor-not-allowed bg-slate-100" : ""
              }`}
              placeholder={isLocked ? "••••••••••••••••" : "AQVN..."}
              required
              id="yandex-api-key-input"
            />
            <p className="text-[10px] text-slate-400 mt-1 leading-normal">
              API-ключ сервисного аккаунта Yandex Cloud для прохождения авторизации.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
              <Folder size={12} className="text-slate-400" />
              Идентификатор каталога (Folder ID)
            </label>
            <input
              type="text"
              value={yandexFolderId}
              disabled={isLocked}
              onChange={(e) => {
                setYandexFolderId(e.target.value);
                handleSaveNotification();
              }}
              className={`w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all placeholder:text-slate-400 ${
                isLocked ? "opacity-75 cursor-not-allowed bg-slate-100" : ""
              }`}
              placeholder="b1g..."
              required
              id="yandex-folder-id-input"
            />
            <p className="text-[10px] text-slate-400 mt-1 leading-normal">
              Укажите ID каталога в Yandex Cloud (folderId), необходимый для формирования URI модели.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Модель YandexGPT</label>
            <select
              value={YANDEX_MODELS.some(m => m.id === yandexModel) ? yandexModel : "custom"}
              disabled={isLocked}
              onChange={(e) => {
                const val = e.target.value;
                setYandexModel(val);
                if (val !== "custom") {
                  setCustomYandexUri("");
                }
                handleSaveNotification();
              }}
              className={`w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all ${
                isLocked ? "opacity-75 cursor-not-allowed bg-slate-100" : ""
              }`}
              id="yandex-model-select"
            >
              {YANDEX_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {(yandexModel === "custom" || !YANDEX_MODELS.some(m => m.id === yandexModel)) && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                Кастомный URI модели
              </label>
              <input
                type="text"
                value={customYandexUri}
                disabled={isLocked}
                onChange={(e) => {
                  setCustomYandexUri(e.target.value);
                  handleSaveNotification();
                }}
                className={`w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all placeholder:text-slate-400 ${
                  isLocked ? "opacity-75 cursor-not-allowed bg-slate-100" : ""
                }`}
                placeholder="gpt://b1g.../deepseek-v4-flash/latest или deepseek-v4-flash/latest"
                required
                id="yandex-custom-uri-input"
              />
              <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                Например: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">gpt://&lt;folder_id&gt;/gpt-oss-120b/latest</code>
              </p>
            </div>
          )}
        </div>
      )}

      {savedStatus && !isLocked && (
        <div className="mt-3.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 animate-fade-in" id="ai-saved-indicator">
          <CheckCircle size={13} />
          Параметры AI обновлены и сохранены локально
        </div>
      )}
    </div>
  );
}
