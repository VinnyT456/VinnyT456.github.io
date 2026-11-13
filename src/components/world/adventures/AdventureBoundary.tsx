"use client";

import { Component, type ReactNode } from "react";

/** A failed optional room must always leave the visitor a way back to the city. */
export default class AdventureBoundary extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="aw-loading" role="alert"><div><p>This room couldn’t open. Your saved progress is still here.</p><button className="aw-button" onClick={this.props.onClose}>Back to city</button><button className="aw-button" onClick={() => location.reload()}>Reload website</button></div></div>;
    return this.props.children;
  }
}
