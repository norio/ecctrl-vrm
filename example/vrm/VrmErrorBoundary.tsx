import { Component, type ErrorInfo, type ReactNode } from "react";

interface VrmErrorBoundaryProps {
  children: ReactNode;
}

interface VrmErrorBoundaryState {
  hasError: boolean;
}

export default class VrmErrorBoundary extends Component<
  VrmErrorBoundaryProps,
  VrmErrorBoundaryState
> {
  state: VrmErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): VrmErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Failed to render VRM character", error, info);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
