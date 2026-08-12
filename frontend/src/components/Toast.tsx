import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type ToastType = 'info' | 'success' | 'error'
interface ToastItem {
  id: number
  message: string
  type: ToastType
}

const ToastContext = createContext<(message: string, type?: ToastType) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

const TYPE_STYLES: Record<ToastType, string> = {
  info: 'bg-ink text-cream',
  success: 'bg-forest text-cream',
  error: 'bg-rust text-cream',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`${TYPE_STYLES[t.type]} rounded-lg px-4 py-3 text-sm font-medium shadow-lg max-w-sm`}
            style={{ animation: 'toast-in 0.2s ease-out' }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
