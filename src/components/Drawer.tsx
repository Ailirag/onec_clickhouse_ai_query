import { useEffect } from "react";
import { X } from "lucide-react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: any;
  children: any;
  widthClass?: string;
  id?: string;
}

// Slide-over panel anchored to the right edge with a dimmed backdrop.
export default function Drawer({ open, onClose, title, subtitle, icon, children, widthClass = "max-w-3xl", id }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex justify-end" id={id}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        className={`relative h-full w-full ${widthClass} bg-slate-50 border-l border-slate-200 shadow-2xl flex flex-col animate-slide-in-right`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            {icon && <div className="p-2 bg-brand-50 text-brand-600 rounded-xl shrink-0">{icon}</div>}
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-800 tracking-tight truncate">{title}</h2>
              {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
            aria-label="Закрыть панель"
            id="drawer-close-btn"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
