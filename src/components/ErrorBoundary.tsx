import React, { Component, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AJA ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="bg-surface border border-border rounded-xl p-8 max-w-md w-full text-center space-y-4">
            <div className="w-12 h-12 bg-accent-red-light rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 text-accent-red" />
            </div>
            <h2 className="text-lg font-bold text-text-primary">Something went wrong</h2>
            <p className="text-sm text-text-secondary">
              {this.state.error?.message || 'An unexpected error occurred in the dashboard.'}
            </p>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent-teal text-white rounded-lg text-sm hover:bg-opacity-90 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
