import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Catches render-time errors anywhere in the tree and shows a recoverable
 * fallback instead of a blank white screen.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // This project ships without @types/react, so the base Component members
  // aren't visible to tsc — declare the ones we use.
  declare props: ErrorBoundaryProps;
  declare setState: (state: Partial<ErrorBoundaryState>) => void;

  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error boundary caught an error:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="surface-card rounded-3xl p-8 max-w-md w-full text-center animate-scale-in">
          <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Что-то пошло не так</h2>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Интерфейс столкнулся с непредвиденной ошибкой. Можно попробовать продолжить работу
            или перезагрузить страницу.
          </p>
          {this.state.error?.message && (
            <pre className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-mono text-slate-500 text-left whitespace-pre-wrap max-h-32 overflow-auto">
              {this.state.error.message}
            </pre>
          )}
          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm shadow-brand-200/50"
            >
              <RotateCcw size={13} />
              Продолжить
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-semibold transition-colors"
            >
              Перезагрузить
            </button>
          </div>
        </div>
      </div>
    );
  }
}
