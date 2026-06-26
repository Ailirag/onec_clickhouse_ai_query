import React, { useState } from "react";
import { X, Server, Terminal, Copy, Check, BookOpen, AlertCircle, Info, ShieldCheck, KeyRound } from "lucide-react";

interface ServerInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ServerInstructionsModal({ isOpen, onClose }: ServerInstructionsModalProps) {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 1500);
  };

  const codeBlocks = {
    install: "npm install",
    dev: "npm run dev",
    build: "npm run build",
    start: "npm run start",
    pm2: "npm install -g pm2\npm2 start dist/server.cjs --name \"1c-clickhouse-ai\"\npm2 save",
    schema: `-- Структура соответствует экспортёру OneSTools.EventLog (akpaevj)
CREATE TABLE EventLogItems
(
    \`ExporterName\` LowCardinality(String),
    \`FileName\` LowCardinality(String),
    \`EndPosition\` Int64,
    \`LgfEndPosition\` Int64,
    \`Id\` Int64,
    \`DateTime\` DateTime('UTC'),
    \`TransactionStatus\` LowCardinality(String),
    \`TransactionDate\` DateTime('UTC'),
    \`TransactionNumber\` Int64,
    \`UserUuid\` LowCardinality(String),
    \`User\` LowCardinality(String),
    \`Computer\` LowCardinality(String),
    \`Application\` LowCardinality(String),
    \`Connection\` Int64,
    \`Event\` LowCardinality(String),
    \`Severity\` LowCardinality(String),
    \`Comment\` String,
    \`MetadataUuid\` String,
    \`Metadata\` LowCardinality(String),
    \`Data\` String,
    \`DataPresentation\` String,
    \`Server\` LowCardinality(String),
    \`MainPort\` Int32,
    \`AddPort\` Int32,
    \`Session\` Int64
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(DateTime)
ORDER BY DateTime;`
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-fade-in" id="instructions-modal">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col relative animate-scale-in">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand-50 text-brand-600 rounded-xl">
              <BookOpen size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">Руководство по развертыванию сервера</h3>
              <p className="text-xs text-slate-500">Инструкция по установке, запуску и конфигурированию в локальной и продакшн среде</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            id="close-instructions-modal-btn"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-600 leading-relaxed max-h-[calc(85vh-150px)]">
          
          {/* Section 1: Requirements */}
          <div className="space-y-2">
            <h4 className="font-semibold text-slate-800 text-base flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded bg-slate-100 text-xs font-bold text-slate-600">1</span>
              Системные требования
            </h4>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-xs">
              <li>Установленный <strong className="text-slate-800">Node.js</strong> версии <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">18.x</code> или выше (LTS).</li>
              <li>СУБД <strong className="text-slate-800">ClickHouse</strong> с активированным HTTP интерфейсом (обычно на порту <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">8123</code>).</li>
              <li>Токены API-провайдеров ИИ: <strong className="text-slate-800">Google Gemini API Key</strong> (из переменных окружения) или <strong className="text-slate-800">Yandex Cloud API</strong>.</li>
            </ul>
          </div>

          {/* Section 2: Quick Start */}
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-800 text-base flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded bg-slate-100 text-xs font-bold text-slate-600">2</span>
              Локальный запуск (Разработка)
            </h4>
            
            <p className="text-xs">Выполните следующие команды в корневом каталоге проекта для установки зависимостей и запуска в Dev-режиме:</p>
            
            <div className="space-y-2.5">
              <div>
                <div className="flex items-center justify-between bg-slate-900 text-slate-300 text-[11px] px-3.5 py-1.5 rounded-t-lg font-mono">
                  <span>Шаг 1. Установка пакетов</span>
                  <button 
                    onClick={() => handleCopy(codeBlocks.install, "install")}
                    className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors"
                  >
                    {copiedText === "install" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    {copiedText === "install" ? "Скопировано!" : "Копировать"}
                  </button>
                </div>
                <pre className="bg-slate-950 text-emerald-400 p-3 rounded-b-lg font-mono text-xs overflow-x-auto">{codeBlocks.install}</pre>
              </div>

              <div>
                <div className="flex items-center justify-between bg-slate-900 text-slate-300 text-[11px] px-3.5 py-1.5 rounded-t-lg font-mono">
                  <span>Шаг 2. Запуск локального сервера разработки (порт 3000)</span>
                  <button 
                    onClick={() => handleCopy(codeBlocks.dev, "dev")}
                    className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors"
                  >
                    {copiedText === "dev" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    {copiedText === "dev" ? "Скопировано!" : "Копировать"}
                  </button>
                </div>
                <pre className="bg-slate-950 text-emerald-400 p-3 rounded-b-lg font-mono text-xs overflow-x-auto">{codeBlocks.dev}</pre>
              </div>
            </div>
          </div>

          {/* Section 3: Production Deploy */}
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-800 text-base flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded bg-slate-100 text-xs font-bold text-slate-600">3</span>
              Сборка и развертывание в Production
            </h4>
            
            <p className="text-xs">Для сборки оптимизированного дистрибутива клиента и сервера выполните компиляцию, а затем запустите автономный Node.js сервер:</p>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between bg-slate-900 text-slate-300 text-[11px] px-3.5 py-1.5 rounded-t-lg font-mono">
                  <span>Компиляция и сборка (выходные файлы помещаются в dist/)</span>
                  <button 
                    onClick={() => handleCopy(codeBlocks.build, "build")}
                    className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors"
                  >
                    {copiedText === "build" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    {copiedText === "build" ? "Скопировано!" : "Копировать"}
                  </button>
                </div>
                <pre className="bg-slate-950 text-emerald-400 p-3 rounded-b-lg font-mono text-xs overflow-x-auto">{codeBlocks.build}</pre>
              </div>

              <div>
                <div className="flex items-center justify-between bg-slate-900 text-slate-300 text-[11px] px-3.5 py-1.5 rounded-t-lg font-mono">
                  <span>Запуск скомпилированного продакшн сервера</span>
                  <button 
                    onClick={() => handleCopy(codeBlocks.start, "start")}
                    className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors"
                  >
                    {copiedText === "start" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                    {copiedText === "start" ? "Скопировано!" : "Копировать"}
                  </button>
                </div>
                <pre className="bg-slate-950 text-emerald-400 p-3 rounded-b-lg font-mono text-xs overflow-x-auto">{codeBlocks.start}</pre>
              </div>

              <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-800 leading-normal flex gap-2.5">
                <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Полезный совет:</strong> Для запуска сервера в фоновом режиме 24/7 и обеспечения автоматического перезапуска используйте менеджер процессов <strong className="text-amber-900 font-semibold">PM2</strong>:
                  <pre className="bg-slate-950/5 text-slate-700 p-2 rounded-lg font-mono text-[10px] mt-2 border border-slate-200 leading-normal overflow-x-auto">
                    {codeBlocks.pm2}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: EventLog Schema */}
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-800 text-base flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded bg-slate-100 text-xs font-bold text-slate-600">4</span>
              Схема таблицы ClickHouse
            </h4>
            
            <p className="text-xs">Приложение ожидает структуру, соответствующую формату выгрузки журналов регистрации 1С. Пример создания таблицы:</p>

            <div>
              <div className="flex items-center justify-between bg-slate-900 text-slate-300 text-[11px] px-3.5 py-1.5 rounded-t-lg font-mono">
                <span>ClickHouse SQL DDL</span>
                <button 
                  onClick={() => handleCopy(codeBlocks.schema, "schema")}
                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors"
                >
                  {copiedText === "schema" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  {copiedText === "schema" ? "Скопировано!" : "Копировать"}
                </button>
              </div>
              <pre className="bg-slate-950 text-slate-300 p-3 rounded-b-lg font-mono text-[10px] max-h-[220px] overflow-y-auto leading-normal">{codeBlocks.schema}</pre>
            </div>
          </div>

          {/* Section 5: Security and Role Permissions */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <h5 className="font-semibold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck size={16} className="text-brand-600" />
              Ролевая модель и безопасность
            </h5>
            <p className="text-xs text-slate-600 leading-relaxed">
              В приложении разграничены права доступа для исключения несанкционированного изменения продуктовых баз данных СУБД или компрометации закрытых токенов AI:
            </p>
            <ul className="list-disc list-inside text-xs space-y-1.5 text-slate-600 pl-2">
              <li>
                <strong className="text-slate-800">Пользователь (User)</strong>: Имеет полный доступ к ИИ-интерфейсу запросов, может в реальном времени генерировать отчеты, графики, просматривать структуру каталогов. Все критические поля настроек заблокированы в режиме «Только чтение».
              </li>
              <li>
                <strong className="text-slate-800">Администратор (Admin)</strong>: Настраивает СУБД ClickHouse, AI-модели и API-ключи. Пароли по умолчанию создаются при первом запуске и хранятся в виде PBKDF2-хеша в <code className="bg-brand-50 text-brand-700 px-1 py-0.5 rounded font-mono font-semibold">passwords.json</code>. Смените их сразу после установки в разделе «Управление паролями».
              </li>
            </ul>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50/50">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 text-white hover:bg-slate-700 rounded-xl text-xs font-semibold transition-all shadow-md"
            id="close-instructions-bottom-btn"
          >
            Понятно
          </button>
        </div>

      </div>
    </div>
  );
}
