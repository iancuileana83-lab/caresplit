import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/** Catches a crash inside a screen, so the visitor sees a calm message and a way out, not a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CareSplit screen crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Something went wrong on this screen</h1>
        <p className="text-quiet">Your receipts are safe. Reload the page, or go back to the start.</p>
        <div className="flex justify-center gap-3 pt-2">
          <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800">
            Reload the page
          </button>
          <a href="/" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-4 text-sm font-medium hover:bg-stone-50">
            Go to the start
          </a>
        </div>
      </div>
    );
  }
}
