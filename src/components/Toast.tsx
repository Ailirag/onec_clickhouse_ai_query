import { useEffect, useState } from "react";
import { Check, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

type Listener = (toast: ToastItem) => void;
const listeners = new Set<Listener>();
let counter = 0;

// Global, context-free toast trigger — call from anywhere.
export function toast(message: string, type: ToastType = "success") {
  const item: ToastItem = { id: ++counter, message, type };
  listeners.forEach((listener) => listener(item));
}

const STYLES: Record<ToastType, { ring: string; icon: any }> = {
  success: { ring: "border-emerald-200", icon: <Check size={15} className="text-emerald-600" /> },
  error: { ring: "border-rose-200", icon: <AlertTriangle size={15} className="text-rose-600" /> },
  info: { ring: "border-brand-200", icon: <Info size={15} className="text-brand-600" /> }
};

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener: Listener = (item) => {
      setToasts((prev) => [...prev, item]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, 2600);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 max-w-[calc(100vw-2.5rem)]" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2.5 pl-3 pr-2.5 py-2.5 rounded-xl bg-white/95 backdrop-blur border ${STYLES[t.type].ring} shadow-lg shadow-slate-900/5 text-xs font-medium text-slate-700 animate-slide-up`}
          role="status"
        >
          {STYLES[t.type].icon}
          <span className="leading-snug">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="ml-1 text-slate-300 hover:text-slate-600 transition-colors"
            aria-label="Закрыть уведомление"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
