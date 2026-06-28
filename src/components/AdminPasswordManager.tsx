import React, { useState } from "react";
import { KeyRound, Shield, User, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { readJsonResponse } from "../api";

interface AdminPasswordManagerProps {
  role: string;
}

export default function AdminPasswordManager({ role }: AdminPasswordManagerProps) {
  const [targetRole, setTargetRole] = useState<"admin" | "user">("user");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null);

  if (role !== "admin") return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) return;

    setLoading(true);
    setStatus(null);

    try {
      const token = localStorage.getItem("auth_token") || "";
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          targetRole,
          newPassword: newPassword.trim()
        })
      });

      const data = await readJsonResponse(response);
      if (response.ok && data.success) {
        setStatus({ success: true, message: data.message });
        setNewPassword("");
      } else {
        setStatus({ success: false, message: data.error || "Не удалось изменить пароль." });
      }
    } catch (err: any) {
      setStatus({ success: false, message: `Ошибка сети: ${err.message || err}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="admin-password-manager" className="surface-card rounded-2xl p-6 shadow-sm transition-all animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 bg-brand-50 text-brand-600 rounded-lg">
          <KeyRound size={22} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800 tracking-tight font-sans">Управление паролями</h2>
          <p className="text-xs text-slate-500">Смена паролей для администратора и пользователя</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Role Select Buttons */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider">
            Выберите роль для смены пароля
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setTargetRole("user");
                setStatus(null);
              }}
              className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                targetRole === "user"
                  ? "bg-white text-slate-800 shadow-sm border border-slate-200/50"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              id="pwd-target-user-btn"
            >
              <User size={13} />
              <span>Пользователь</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTargetRole("admin");
                setStatus(null);
              }}
              className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                targetRole === "admin"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              id="pwd-target-admin-btn"
            >
              <Shield size={13} />
              <span>Администратор</span>
            </button>
          </div>
        </div>

        {/* New Password Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
            Новый пароль
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setStatus(null);
            }}
            placeholder="Введите не менее 3 символов…"
            className="w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all placeholder:text-slate-400"
            required
            minLength={3}
            id="pwd-new-input"
          />
        </div>

        {status && (
          <div
            className={`p-3 rounded-xl border flex items-start gap-2 text-xs leading-normal ${
              status.success
                ? "bg-emerald-50 border-emerald-100 text-emerald-800 animate-fade-in"
                : "bg-rose-50 border-rose-100 text-rose-800 animate-fade-in"
            }`}
            id="pwd-status-banner"
          >
            {status.success ? (
              <CheckCircle size={15} className="text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
            )}
            <span>{status.message}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !newPassword.trim()}
          className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-lg text-xs font-semibold tracking-wide transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
          id="pwd-submit-btn"
        >
          {loading ? (
            <>
              <RefreshCw size={13} className="animate-spin" />
              <span>Сохранение…</span>
            </>
          ) : (
            <span>Сохранить новый пароль</span>
          )}
        </button>
      </form>
    </div>
  );
}
