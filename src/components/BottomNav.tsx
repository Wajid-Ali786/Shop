import { useI18n } from '../i18n'
import type { TranslationKey } from '../i18n/en'
import { cx } from './ui'

interface Tab {
  path: string
  key: TranslationKey
  icon: string
}

const TABS: Tab[] = [
  { path: '/', key: 'nav.home', icon: 'M3 10.5L12 3l9 7.5M5 9.5V21h14V9.5' },
  {
    path: '/products',
    key: 'nav.products',
    icon: 'M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4',
  },
  {
    path: '/stock',
    key: 'nav.stock',
    icon: 'M4 4h16v5H4V4zm0 7h16v9H4v-9zm5 3h6',
  },
  { path: '/settings', key: 'nav.settings', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.7 1.7 0 008.9 19a1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1A1.7 1.7 0 005 8.9a1.7 1.7 0 00-.4-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z' },
]

export function BottomNav({
  path,
  onNavigate,
}: {
  path: string
  onNavigate: (path: string) => void
}) {
  const { t } = useI18n()

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-lg">
        {TABS.map((tab) => {
          // "/" sirf exact match par active, baqi apne prefix par.
          const active = tab.path === '/' ? path === '/' : path.startsWith(tab.path)
          return (
            <button
              key={tab.path}
              onClick={() => onNavigate(tab.path)}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors',
                active ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500',
              )}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={active ? 2.2 : 1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={tab.icon} />
              </svg>
              <span className="text-[11px] font-medium">{t(tab.key)}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
