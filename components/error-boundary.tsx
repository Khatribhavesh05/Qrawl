'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          className="min-h-screen flex items-center justify-center px-6"
          style={{ background: '#060d1a' }}
        >
          <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.15)',
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#f87171"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-bold" style={{ color: '#f1f5f9' }}>
                Something went wrong
              </h2>
              <p
                className="text-sm font-mono px-4 py-2.5 rounded-xl"
                style={{
                  color: '#94a3b8',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 px-5 rounded-xl text-sm font-bold transition-all duration-150 cursor-pointer"
              style={{ background: '#22c55e', color: '#052e16' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#16a34a')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#22c55e')}
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Made with Bob
