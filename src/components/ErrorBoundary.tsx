import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence: an unexpected rendering bug shows a message and a reload button
 * instead of a blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[spotter] render error', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="feed-status" role="alert">
        <h1>Something went wrong showing the board</h1>
        <p className="feed-status__text">
          This is a bug in Spotter, not a problem with the feed. Reloading usually fixes it.
        </p>
        <button
          type="button"
          className="feed-status__retry"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
        <p className="feed-status__detail">{this.state.error.message}</p>
      </main>
    );
  }
}
