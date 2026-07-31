import { useEffect, type ReactNode } from 'react'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// --------------------------------------------------------------------- Button

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white active:bg-brand-700 disabled:bg-brand-300',
  secondary:
    'bg-white text-slate-800 ring-1 ring-slate-200 active:bg-slate-100 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 dark:active:bg-slate-700',
  ghost:
    'bg-transparent text-slate-600 active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800',
  danger: 'bg-red-600 text-white active:bg-red-700 disabled:bg-red-300',
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  full?: boolean
}

export function Button({
  variant = 'primary',
  full,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(
        // min-h-12: mobile par ungli ke liye kam se kam 48px target.
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-colors disabled:opacity-60',
        BUTTON_STYLES[variant],
        full && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------- Field

export function Field({
  label,
  hint,
  error,
  children,
  required,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      )}
      {error && <span className="mt-1.5 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  )
}

const CONTROL_CLASS =
  'w-full rounded-xl border-0 bg-white px-3.5 py-3 text-slate-900 ring-1 ring-slate-200 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 dark:placeholder:text-slate-500'

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL_CLASS, className)} {...rest} />
}

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(CONTROL_CLASS, 'appearance-none', className)} {...rest} />
}

export function Textarea({
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL_CLASS, className)} {...rest} />
}

// ----------------------------------------------------------------------- Card

export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'rounded-2xl bg-white p-4 ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export function Section({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6">
      {(title || action) && (
        <div className="mb-2 flex items-center justify-between px-1">
          {title && (
            <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------- Sheet

/** Neeche se upar aane wala bottom sheet — mobile par modal se behtar hai. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  // Sheet khuli ho to peeche wala page scroll na ho.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="animate-fade-in absolute inset-0 bg-slate-900/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet-in pb-safe relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-bold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="close"
            className="-me-2 flex h-10 w-10 items-center justify-center rounded-full text-slate-400 active:bg-slate-100 dark:active:bg-slate-800"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------- Toast

export function Toast({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-60 flex justify-center px-4">
      <div className="animate-fade-in rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
        {message}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- EmptyState

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-4 text-5xl opacity-70">{icon}</div>
      <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {body && <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

// -------------------------------------------------------------------- Spinner

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx('animate-spin', className ?? 'h-5 w-5')}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"
      />
    </svg>
  )
}

// ------------------------------------------------------------------ AppHeader

export function AppHeader({
  title,
  onBack,
  action,
}: {
  title: string
  onBack?: () => void
  action?: ReactNode
}) {
  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-slate-200/80 bg-slate-50/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex h-14 items-center gap-2 px-2">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 active:bg-slate-200 dark:text-slate-300 dark:active:bg-slate-800"
          >
            {/* RTL me arrow apne aap palat jata hai. */}
            <svg viewBox="0 0 24 24" className="h-6 w-6 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <h1 className={cx('flex-1 truncate text-xl font-bold', !onBack && 'ps-2')}>{title}</h1>
        {action}
      </div>
    </header>
  )
}
