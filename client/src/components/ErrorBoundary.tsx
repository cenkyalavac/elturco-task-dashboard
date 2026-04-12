import { Component, type ErrorInfo, type ReactNode } from "react";

// ── Types ──

type ErrorLevel = "app" | "page" | "widget";

interface ErrorBoundaryProps {
  children: ReactNode;
  level?: ErrorLevel;
  /** Optional fallback to render instead of the default error UI */
  fallback?: ReactNode;
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ── Error Boundary Component ──

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.level ?? "app"}]`, error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const level = this.props.level ?? "app";

    switch (level) {
      case "app":
        return <AppErrorFallback onReload={this.handleReload} error={this.state.error} />;
      case "page":
        return <PageErrorFallback onRetry={this.handleRetry} error={this.state.error} />;
      case "widget":
        return <WidgetErrorFallback onRetry={this.handleRetry} />;
      default:
        return <AppErrorFallback onReload={this.handleReload} error={this.state.error} />;
    }
  }
}

// ── App-level fallback: full-page "Something went wrong" with reload ──

function AppErrorFallback({ onReload, error }: { onReload: () => void; error: Error | null }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center max-w-md px-6">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-white mb-2">Something went wrong</h1>
        <p className="text-sm text-white/50 mb-6">
          An unexpected error occurred. Please reload the page to try again.
        </p>
        {error && (
          <pre className="text-xs text-red-400/70 bg-red-500/5 border border-red-500/10 rounded-lg p-3 mb-6 text-left overflow-auto max-h-32">
            {error.message}
          </pre>
        )}
        <button
          onClick={onReload}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
            />
          </svg>
          Reload Page
        </button>
      </div>
    </div>
  );
}

// ── Page-level fallback: retry without crashing the whole app ──

function PageErrorFallback({ onRetry, error }: { onRetry: () => void; error: Error | null }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="text-center max-w-md">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">This page encountered an error</h2>
        <p className="text-sm text-white/50 mb-4">
          Something went wrong while rendering this page. You can try again or navigate to another page.
        </p>
        {error && (
          <pre className="text-xs text-amber-400/70 bg-amber-500/5 border border-amber-500/10 rounded-lg p-3 mb-4 text-left overflow-auto max-h-24">
            {error.message}
          </pre>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
              />
            </svg>
            Retry
          </button>
          <a
            href="#/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.06] text-white/70 text-sm font-medium hover:bg-white/[0.1] transition-colors border border-white/[0.08]"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Widget-level fallback: minimal inline error ──

function WidgetErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center justify-center p-4 rounded-lg border border-white/[0.06] bg-white/[0.02] min-h-[120px]">
      <div className="text-center">
        <p className="text-xs text-white/40 mb-2">Failed to load this widget</p>
        <button
          onClick={onRetry}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export default ErrorBoundary;
