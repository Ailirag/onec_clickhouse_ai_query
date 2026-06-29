import React, { useEffect, useState } from "react";
import { Users, UserPlus, Shield, User, Trash2, RotateCcw, KeyRound, Coins, RefreshCw } from "lucide-react";
import { ManagedUser, UserRole } from "../types";
import { readJsonResponse } from "../api";
import { toast } from "./Toast";

interface UserManagerProps {
  role: string;
}

function authHeaders() {
  const token = localStorage.getItem("auth_token") || "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export default function UserManager({ role }: UserManagerProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // New-user form
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("user");
  const [newLimit, setNewLimit] = useState("");
  const [creating, setCreating] = useState(false);

  const currentUsername = localStorage.getItem("user_name") || "";

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users", { headers: authHeaders() });
      const data = await readJsonResponse(res);
      if (data.success) setUsers(data.users);
      else toast(data.error || "Не удалось загрузить пользователей", "error");
    } catch (err: any) {
      toast(`Ошибка сети: ${err.message || err}`, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role === "admin") loadUsers();
  }, [role]);

  if (role !== "admin") return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
          dailyTokenLimit: Number(newLimit) || 0
        })
      });
      const data = await readJsonResponse(res);
      if (res.ok && data.success) {
        toast(`Пользователь «${data.user.username}» создан`);
        setNewUsername("");
        setNewPassword("");
        setNewRole("user");
        setNewLimit("");
        loadUsers();
      } else {
        toast(data.error || "Не удалось создать пользователя", "error");
      }
    } catch (err: any) {
      toast(`Ошибка сети: ${err.message || err}`, "error");
    } finally {
      setCreating(false);
    }
  };

  const updateUser = async (id: string, patch: Record<string, any>, successMsg: string) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/users/update", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ id, ...patch })
      });
      const data = await readJsonResponse(res);
      if (res.ok && data.success) {
        toast(successMsg);
        loadUsers();
      } else {
        toast(data.error || "Не удалось обновить пользователя", "error");
      }
    } catch (err: any) {
      toast(`Ошибка сети: ${err.message || err}`, "error");
    } finally {
      setBusyId(null);
    }
  };

  const resetUsage = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/users/reset-usage", { method: "POST", headers: authHeaders(), body: JSON.stringify({ id }) });
      const data = await readJsonResponse(res);
      if (res.ok && data.success) {
        toast("Расход токенов обнулён");
        loadUsers();
      } else toast(data.error || "Ошибка", "error");
    } finally {
      setBusyId(null);
    }
  };

  const deleteUser = async (id: string, name: string) => {
    setBusyId(id);
    try {
      const res = await fetch("/api/users/delete", { method: "POST", headers: authHeaders(), body: JSON.stringify({ id }) });
      const data = await readJsonResponse(res);
      if (res.ok && data.success) {
        toast(`Пользователь «${name}» удалён`);
        loadUsers();
      } else toast(data.error || "Не удалось удалить", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div id="user-manager" className="surface-card rounded-2xl p-6 shadow-sm transition-all animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand-50 text-brand-600 rounded-lg">
            <Users size={22} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800 tracking-tight font-sans">Пользователи</h2>
            <p className="text-xs text-slate-500">Логины, роли и дневные лимиты токенов</p>
          </div>
        </div>
        <button
          onClick={loadUsers}
          disabled={loading}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
          aria-label="Обновить список"
          title="Обновить список"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* New user form */}
      <form onSubmit={handleCreate} className="mb-5 p-4 rounded-xl border border-slate-100 bg-slate-50/40 space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          <UserPlus size={13} /> Новый пользователь
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <input
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="Логин"
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            id="new-user-username"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Пароль (мин. 3 символа)"
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            id="new-user-password"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as UserRole)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            id="new-user-role"
          >
            <option value="user">Пользователь</option>
            <option value="admin">Администратор</option>
          </select>
          <input
            type="number"
            min={0}
            value={newLimit}
            onChange={(e) => setNewLimit(e.target.value)}
            placeholder="Дневной лимит токенов (0 = без лимита)"
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            id="new-user-limit"
          />
        </div>
        <button
          type="submit"
          disabled={creating || !newUsername.trim() || !newPassword.trim()}
          className="w-full sm:w-auto px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          id="create-user-btn"
        >
          <UserPlus size={13} /> Добавить пользователя
        </button>
      </form>

      {/* User list */}
      <div className="space-y-2.5" id="user-list">
        {users.length === 0 && !loading && (
          <div className="text-center py-6 text-xs text-slate-400">Пользователей нет.</div>
        )}
        {users.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            isSelf={u.username.toLowerCase() === currentUsername.toLowerCase()}
            busy={busyId === u.id}
            onSaveLimit={(limit) => updateUser(u.id, { dailyTokenLimit: limit }, "Лимит обновлён")}
            onToggleRole={() => updateUser(u.id, { role: u.role === "admin" ? "user" : "admin" }, "Роль изменена")}
            onChangePassword={(pwd) => updateUser(u.id, { newPassword: pwd }, "Пароль изменён")}
            onResetUsage={() => resetUsage(u.id)}
            onDelete={() => deleteUser(u.id, u.username)}
          />
        ))}
      </div>
    </div>
  );
}

interface UserRowProps {
  key?: string;
  user: ManagedUser;
  isSelf: boolean;
  busy: boolean;
  onSaveLimit: (limit: number) => void;
  onToggleRole: () => void;
  onChangePassword: (pwd: string) => void;
  onResetUsage: () => void;
  onDelete: () => void;
}

function UserRow({ user, isSelf, busy, onSaveLimit, onToggleRole, onChangePassword, onResetUsage, onDelete }: UserRowProps) {
  const [limit, setLimit] = useState(String(user.dailyTokenLimit || 0));
  const [pwd, setPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    setLimit(String(user.dailyTokenLimit || 0));
  }, [user.dailyTokenLimit]);

  const overBudget = user.dailyTokenLimit > 0 && user.tokensUsedToday >= user.dailyTokenLimit;
  const limitChanged = String(user.dailyTokenLimit || 0) !== String(Number(limit) || 0);

  return (
    <div className="border border-slate-100 rounded-xl p-3.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {user.role === "admin" ? <Shield size={14} className="text-brand-500 shrink-0" /> : <User size={14} className="text-slate-500 shrink-0" />}
          <span className="font-semibold text-sm text-slate-800 truncate">{user.username}</span>
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
            {user.role === "admin" ? "админ" : "польз."}
          </span>
          {isSelf && <span className="text-[10px] text-brand-600">это вы</span>}
        </div>
        <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${overBudget ? "text-rose-600" : "text-slate-500"}`}>
          <Coins size={12} />
          {user.tokensUsedToday.toLocaleString()}
          {user.dailyTokenLimit > 0 ? ` / ${user.dailyTokenLimit.toLocaleString()}` : " · без лимита"}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Дневной лимит</label>
          <input
            type="number"
            min={0}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="w-36 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
        <button
          onClick={() => onSaveLimit(Math.max(0, Number(limit) || 0))}
          disabled={busy || !limitChanged}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold disabled:opacity-40 transition-colors"
        >
          Сохранить
        </button>
        <button
          onClick={onResetUsage}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition-colors"
          title="Обнулить расход за сегодня"
        >
          <RotateCcw size={12} /> Сбросить расход
        </button>
        <button
          onClick={onToggleRole}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition-colors"
          title="Переключить роль"
        >
          <Shield size={12} /> {user.role === "admin" ? "Сделать польз." : "Сделать админом"}
        </button>
        <button
          onClick={() => setShowPwd((v) => !v)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <KeyRound size={12} /> Пароль
        </button>
        {!isSelf && (
          <button
            onClick={onDelete}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 transition-colors ml-auto"
          >
            <Trash2 size={12} /> Удалить
          </button>
        )}
      </div>

      {showPwd && (
        <div className="mt-2.5 flex gap-2 animate-fade-in">
          <input
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Новый пароль (мин. 3 символа)"
            className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
          <button
            onClick={() => {
              if (pwd.trim().length < 3) {
                toast("Пароль не короче 3 символов", "error");
                return;
              }
              onChangePassword(pwd);
              setPwd("");
              setShowPwd(false);
            }}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold disabled:opacity-40 transition-colors"
          >
            Сменить
          </button>
        </div>
      )}
    </div>
  );
}
