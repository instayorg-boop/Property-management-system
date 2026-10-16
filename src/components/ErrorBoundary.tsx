import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; resetKey?: string };
type State = { failed: boolean };

/** Catches render errors so one broken page shows a recovery screen instead of a blank app. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  componentDidCatch(error: unknown) {
    console.error("Unhandled render error", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "inherit" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>Your data is safe. Please reload the page and try again.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid currentColor", cursor: "pointer", background: "transparent", color: "inherit" }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
