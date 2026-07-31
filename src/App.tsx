import { useEffect } from 'react'
import { useI18n } from './i18n'
import { useRoute, matchRoute, navigate } from './lib/router'
import { useSettings, useToast } from './lib/hooks'
import { applyTheme, watchSystemTheme } from './lib/theme'
import { initializeApp } from './db/repo'
import { requestPersistentStorage } from './db'
import { BottomNav } from './components/BottomNav'
import { Spinner, Toast } from './components/ui'
import { DashboardScreen } from './screens/Dashboard'
import { ProductsScreen } from './screens/Products'
import { ProductFormScreen } from './screens/ProductForm'
import { ProductDetailScreen } from './screens/ProductDetail'
import { StockScreen } from './screens/Stock'
import { CategoriesScreen } from './screens/Categories'
import { SettingsScreen } from './screens/Settings'

/** Bottom nav sirf top-level screens par dikhta hai, form/detail par nahi. */
const NAV_PATHS = ['/', '/products', '/stock', '/settings']

export function App() {
  const { ready } = useI18n()
  const settings = useSettings()
  const [path, go] = useRoute()
  const toast = useToast()

  // Pehli baar: default categories daalo aur storage ko persistent banao.
  useEffect(() => {
    void initializeApp()
    void requestPersistentStorage()
  }, [])

  useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])

  useEffect(() => watchSystemTheme(() => settings.theme), [settings.theme])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  const showNav = NAV_PATHS.includes(path)

  return (
    <div className="mx-auto min-h-screen max-w-lg">
      <main className={showNav ? 'pb-24' : ''}>
        <Router path={path} onToast={toast.show} />
      </main>

      {showNav && <BottomNav path={path} onNavigate={go} />}
      <Toast message={toast.message} />
    </div>
  )
}

function Router({ path, onToast }: { path: string; onToast: (msg: string) => void }) {
  if (path === '/') return <DashboardScreen />
  if (path === '/products') return <ProductsScreen onToast={onToast} />
  if (path === '/stock') return <StockScreen onToast={onToast} />
  if (path === '/settings') return <SettingsScreen onToast={onToast} />
  if (path === '/categories') return <CategoriesScreen onToast={onToast} />
  if (path === '/product/new') return <ProductFormScreen onToast={onToast} />

  const edit = matchRoute(path, '/product/:id/edit')
  if (edit) {
    const id = Number(edit.id)
    if (Number.isFinite(id)) return <ProductFormScreen productId={id} onToast={onToast} />
  }

  const detail = matchRoute(path, '/product/:id')
  if (detail) {
    const id = Number(detail.id)
    if (Number.isFinite(id)) return <ProductDetailScreen productId={id} onToast={onToast} />
  }

  // Anjaan route par home bhej do.
  navigate('/')
  return null
}
