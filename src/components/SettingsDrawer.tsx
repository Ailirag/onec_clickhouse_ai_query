import { useState } from "react";
import { Settings, Database, BrainCircuit, Users } from "lucide-react";
import Drawer from "./Drawer";
import ClickHouseConnector from "./ClickHouseConnector";
import AiConfigPanel from "./AiConfigPanel";
import UserManager from "./UserManager";
import { AiConfig, ClickHouseConfig, UserRole } from "../types";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  role: UserRole;
  config: ClickHouseConfig;
  isDemoMode: boolean;
  onConfigChange: (config: ClickHouseConfig, isDemo: boolean) => void;
  onConnectionVerified: (config: ClickHouseConfig, isDemo: boolean) => void;
  aiConfig: AiConfig;
  onAiConfigChange: (config: AiConfig) => void;
}

type TabKey = "connection" | "ai" | "users";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "connection", label: "Подключение", icon: Database },
  { key: "ai", label: "AI-провайдер", icon: BrainCircuit },
  { key: "users", label: "Пользователи", icon: Users }
];

export default function SettingsDrawer({
  open,
  onClose,
  role,
  config,
  isDemoMode,
  onConfigChange,
  onConnectionVerified,
  aiConfig,
  onAiConfigChange
}: SettingsDrawerProps) {
  const [tab, setTab] = useState<TabKey>("connection");

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Настройки"
      subtitle="Подключение к ClickHouse, AI-провайдер и пользователи"
      icon={<Settings size={20} />}
      widthClass="max-w-4xl"
      id="settings-drawer"
    >
      <div className="flex flex-col sm:flex-row gap-5">
        {/* Vertical tab rail */}
        <nav className="flex sm:flex-col gap-1 sm:w-52 shrink-0" id="settings-tabs">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors text-left ${
                  active
                    ? "bg-brand-500 text-white shadow-sm shadow-brand-200/50"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
                id={`settings-tab-${t.key}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={16} className={active ? "text-white" : "text-slate-400"} />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Active tab content */}
        <div className="flex-1 min-w-0">
          {tab === "connection" && (
            <ClickHouseConnector
              onConfigChange={onConfigChange}
              onConnectionVerified={onConnectionVerified}
              activeConfig={config}
              isDemoMode={isDemoMode}
              role={role}
            />
          )}
          {tab === "ai" && <AiConfigPanel config={aiConfig} onConfigChange={onAiConfigChange} role={role} />}
          {tab === "users" && <UserManager role={role} />}
        </div>
      </div>
    </Drawer>
  );
}
