import React, { useState, useEffect } from "react";
import { ClickHouseConfig, UserRole } from "../types";
import { Database, Shield, CheckCircle, AlertTriangle, Play, Lock } from "lucide-react";
import { readJsonResponse } from "../api";

interface ClickHouseConnectorProps {
  onConfigChange: (config: ClickHouseConfig, isDemo: boolean) => void;
  onConnectionVerified?: (config: ClickHouseConfig, isDemo: boolean) => void;
  activeConfig: ClickHouseConfig;
  isDemoMode: boolean;
  role: UserRole;
}

export default function ClickHouseConnector({
  onConfigChange,
  onConnectionVerified,
  activeConfig,
  isDemoMode,
  role
}: ClickHouseConnectorProps) {
  const [host, setHost] = useState(activeConfig.host);
  const [port, setPort] = useState(activeConfig.port);
  const [username, setUsername] = useState(activeConfig.username);
  const [password, setPassword] = useState(activeConfig.password || "");
  const [database, setDatabase] = useState(activeConfig.database);
  const [useHttps, setUseHttps] = useState(activeConfig.useHttps);
  const [isDemo, setIsDemo] = useState(isDemoMode);

  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  const isLocked = role === "user";

  useEffect(() => {
    // Only trigger updates if administrator is active
    if (!isLocked) {
      onConfigChange({ host, port, username, password, database, useHttps }, isDemo);
    }
  }, [host, port, username, password, database, useHttps, isDemo, isLocked]);

  const handleTestConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setTesting(true);
    setStatus(null);

    try {
      const token = localStorage.getItem("auth_token") || "";
      const response = await fetch("/api/clickhouse/test", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          config: { host, port, username, password, database, useHttps },
          isDemo
        })
      });
      const data = await readJsonResponse(response);
      if (data.success) {
        setStatus({ success: true, message: data.message });
        onConnectionVerified?.({ host, port, username, password, database, useHttps }, isDemo);
      } else {
        setStatus({ success: false, message: data.error || "Не удалось установить соединение." });
      }
    } catch (err: any) {
      setStatus({ success: false, message: `Ошибка сети: ${err.message || err}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div id="clickhouse-connector" className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm transition-all">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-50 text-sky-600 rounded-lg">
            <Database size={22} id="database-icon" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800 tracking-tight flex items-center gap-2">
              Подключение к ClickHouse
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
            <p className="text-xs text-slate-500">Настройте параметры СУБД или запустите демо</p>
          </div>
        </div>
        
        <button
          onClick={() => {
            if (!isLocked) {
              setIsDemo(!isDemo);
            }
          }}
          disabled={isLocked}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
            isLocked ? "opacity-75 cursor-not-allowed" : "cursor-pointer"
          } ${
            isDemo
              ? "bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200"
              : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
          }`}
          id="demo-mode-toggle"
        >
          <Play size={13} fill={isDemo ? "currentColor" : "none"} />
          {isDemo ? "Демо-режим активен" : "Включить демо-режим"}
        </button>
      </div>

      {/* Role Restriction Banner */}
      {isLocked ? (
        <div className="mb-5 p-3 bg-amber-50/80 border border-amber-200/60 rounded-xl flex items-start gap-2.5 text-amber-800 text-xs leading-normal animate-fade-in" id="clickhouse-locked-notice">
          <Lock size={15} className="mt-0.5 text-amber-600 shrink-0" />
          <div>
            <span className="font-semibold">Просмотр подключения ограничен</span>
            <p className="mt-0.5 text-amber-700/90">Изменение реквизитов подключения к ClickHouse доступно только администраторам.</p>
          </div>
        </div>
      ) : (
        <div className="mb-5 p-3 bg-emerald-50/80 border border-emerald-200/60 rounded-xl flex items-start gap-2.5 text-emerald-800 text-xs leading-normal animate-fade-in" id="clickhouse-unlocked-notice">
          <CheckCircle size={15} className="mt-0.5 text-emerald-600 shrink-0" />
          <div>
            <span className="font-semibold">Коннектор ClickHouse доступен</span>
            <p className="mt-0.5 text-emerald-700/90">Вы можете изменить параметры реальной базы ClickHouse или переключиться на демо.</p>
          </div>
        </div>
      )}

      {isDemo && (
        <div className="mb-5 p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 text-xs text-emerald-800 leading-relaxed flex gap-3 items-start">
          <CheckCircle size={18} className="text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Используется демо-данные журнала регистрации 1C!</span> Предоставлено 150 сгенерированных записей с событиями входа, проведения документов, предупреждений и системных ошибок, соответствующих структуре экспортера <strong>OneSTools.EventLog (автор akpaevj)</strong>. Подключение к реальному ClickHouse не требуется.
          </div>
        </div>
      )}

      <form onSubmit={handleTestConnection} className={`space-y-4 ${isDemo ? "opacity-50 pointer-events-none transition-opacity" : ""}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Адрес хоста или полный URL</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className={`w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all placeholder:text-slate-400 ${
                isLocked ? "opacity-75 cursor-not-allowed bg-slate-100" : ""
              }`}
              placeholder="localhost или https://host/data"
              disabled={isDemo || isLocked}
              required={!isDemo}
              id="host-input"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Порт (если указан только хост)</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className={`w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all ${
                isLocked ? "opacity-75 cursor-not-allowed bg-slate-100" : ""
              }`}
              placeholder="8123"
              disabled={isDemo || isLocked}
              required={!isDemo}
              id="port-input"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Пользователь</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all placeholder:text-slate-400 ${
                isLocked ? "opacity-75 cursor-not-allowed bg-slate-100" : ""
              }`}
              placeholder="default"
              disabled={isDemo || isLocked}
              id="user-input"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all placeholder:text-slate-400 ${
                isLocked ? "opacity-75 cursor-not-allowed bg-slate-100" : ""
              }`}
              placeholder={isLocked ? "••••••••" : "Пароль"}
              disabled={isDemo || isLocked}
              id="password-input"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">База данных</label>
            <input
              type="text"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              className={`w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all placeholder:text-slate-400 ${
                isLocked ? "opacity-75 cursor-not-allowed bg-slate-100" : ""
              }`}
              placeholder="default"
              disabled={isDemo || isLocked}
              required={!isDemo}
              id="database-input"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <label className={`flex items-center gap-2 text-xs text-slate-600 font-medium select-none ${
            isLocked ? "cursor-not-allowed opacity-75" : "cursor-pointer"
          }`} id="ssl-checkbox-label">
            <input
              type="checkbox"
              checked={useHttps}
              onChange={(e) => setUseHttps(e.target.checked)}
              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500/20"
              disabled={isDemo || isLocked}
              id="ssl-checkbox"
            />
            <Shield size={14} className="text-slate-400" />
            Использовать защищенное соединение (HTTPS)
          </label>

          <button
            type="submit"
            disabled={testing || isLocked}
            className={`px-5 py-2 text-white rounded-lg font-medium text-xs tracking-wide transition-colors shadow-sm ${
              isLocked 
                ? "bg-slate-300 text-slate-500 cursor-not-allowed" 
                : "bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300"
            }`}
            id="test-connection-btn"
          >
            {testing ? "Проверка..." : "Проверить подключение"}
          </button>
        </div>
      </form>

      {status && (
        <div
          className={`mt-4 p-3.5 rounded-lg border text-xs flex gap-3 items-start transition-all ${
            status.success
              ? "bg-emerald-50 border-emerald-100 text-emerald-800"
              : "bg-rose-50 border-rose-100 text-rose-800"
          }`}
          id="connection-status"
        >
          {status.success ? (
            <CheckCircle size={16} className="text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
          )}
          <span className="leading-normal">{status.message}</span>
        </div>
      )}
    </div>
  );
}
