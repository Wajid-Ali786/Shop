import { useEffect, useRef, useState } from 'react'
import { saveSetting } from '../db/repo'
import {
  canShareFiles,
  clearAllData,
  downloadBackup,
  parseBackupFile,
  restoreBackup,
  shareBackup,
  type BackupFile,
} from '../db/backup'
import { getStorageEstimate } from '../db'
import { useI18n } from '../i18n'
import type { Lang } from '../i18n'
import { useSettings } from '../lib/hooks'
import { applyTheme, type Theme } from '../lib/theme'
import { formatBytes, formatDate } from '../lib/format'
import { navigate } from '../lib/router'
import { AppHeader, Button, Card, Field, Input, Section, Sheet, Spinner, cx } from '../components/ui'

export function SettingsScreen({ onToast }: { onToast: (msg: string) => void }) {
  const { t, lang, setLang } = useI18n()
  const settings = useSettings()

  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string>()
  const [pendingBackup, setPendingBackup] = useState<BackupFile>()
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean>()

  useEffect(() => {
    getStorageEstimate().then(setStorage)
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(undefined))
  }, [])

  const setTheme = (theme: Theme) => {
    void saveSetting('theme', theme)
    applyTheme(theme)
  }

  const doExport = async () => {
    setBusy(t('settings.exporting'))
    try {
      await downloadBackup(settings.shopName)
      onToast(t('settings.exported'))
    } catch {
      onToast(t('error.generic'))
    } finally {
      setBusy(undefined)
    }
  }

  const doShare = async () => {
    setBusy(t('settings.exporting'))
    try {
      const shared = await shareBackup(settings.shopName)
      // Share sheet cancel ho jaye to download par gir jate hain — backup zaroori hai.
      if (!shared) await downloadBackup(settings.shopName)
      onToast(t('settings.exported'))
    } catch {
      onToast(t('error.generic'))
    } finally {
      setBusy(undefined)
    }
  }

  const onFilePicked = async (file?: File) => {
    if (!file) return
    try {
      // Restore se pehle mode poochte hain — replace se maujooda data mit sakta hai.
      setPendingBackup(await parseBackupFile(file))
    } catch {
      onToast(t('settings.importInvalid'))
    }
  }

  const doRestore = async (mode: 'merge' | 'replace') => {
    if (!pendingBackup) return
    setPendingBackup(undefined)
    setBusy(t('settings.importing'))
    try {
      const result = await restoreBackup(pendingBackup, mode)
      onToast(
        t('settings.imported', { products: result.products, categories: result.categories }),
      )
    } catch {
      onToast(t('error.generic'))
    } finally {
      setBusy(undefined)
    }
  }

  const doClearAll = async () => {
    if (!window.confirm(t('settings.clearConfirm'))) return
    await clearAllData()
    onToast(t('settings.cleared'))
    navigate('/')
  }

  const lastBackupText = settings.lastBackupAt
    ? t('settings.lastBackup', { when: formatDate(settings.lastBackupAt, lang) })
    : t('settings.lastBackupNever')

  return (
    <div className="pb-4">
      <AppHeader title={t('settings.title')} />

      <div className="p-4">
        <Section title={t('settings.language')}>
          <div className="grid grid-cols-2 gap-2">
            {(['en', 'ur'] as Lang[]).map((code) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                className={cx(
                  'min-h-14 rounded-xl text-base font-semibold transition-colors',
                  lang === code
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800',
                )}
              >
                {code === 'en' ? 'English' : 'اردو'}
              </button>
            ))}
          </div>
        </Section>

        <Section title={t('settings.theme')}>
          <div className="grid grid-cols-3 gap-2">
            {(['light', 'dark', 'system'] as Theme[]).map((theme) => (
              <button
                key={theme}
                onClick={() => setTheme(theme)}
                className={cx(
                  'min-h-12 rounded-xl text-sm font-semibold transition-colors',
                  settings.theme === theme
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800',
                )}
              >
                {theme === 'light'
                  ? `☀️ ${t('settings.themeLight')}`
                  : theme === 'dark'
                    ? `🌙 ${t('settings.themeDark')}`
                    : `⚙️ ${t('settings.themeSystem')}`}
              </button>
            ))}
          </div>
        </Section>

        <Section>
          <Card className="space-y-4">
            <Field label={t('settings.shopName')}>
              <Input
                value={settings.shopName}
                onChange={(e) => void saveSetting('shopName', e.target.value)}
                placeholder={t('settings.shopNamePlaceholder')}
                dir="auto"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('settings.currency')}>
                <Input
                  value={settings.currency}
                  onChange={(e) => void saveSetting('currency', e.target.value)}
                  maxLength={5}
                />
              </Field>
              <Field label={t('settings.defaultLowStock')}>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={String(settings.defaultLowStockAt)}
                  onChange={(e) =>
                    void saveSetting('defaultLowStockAt', Number(e.target.value) || 0)
                  }
                />
              </Field>
            </div>
          </Card>
        </Section>

        <Section title={t('nav.categories')}>
          <button
            onClick={() => navigate('/categories')}
            className="flex w-full items-center justify-between rounded-2xl bg-white p-4 text-start ring-1 ring-slate-200/70 active:bg-slate-50 dark:bg-slate-900 dark:ring-slate-800"
          >
            <span className="font-medium">{t('categories.title')}</span>
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-400 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </Section>

        {/* Backup section — offline-only app me sab se ahem screen. */}
        <Section title={t('settings.dataSection')}>
          <Card className="space-y-3">
            <div>
              <p className="font-semibold">{t('settings.backup')}</p>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {t('settings.backupDesc')}
              </p>
              <p
                className={cx(
                  'mt-1.5 text-xs font-medium',
                  settings.lastBackupAt ? 'text-slate-500 dark:text-slate-400' : 'text-amber-600',
                )}
              >
                {lastBackupText}
              </p>
            </div>

            <div className="flex gap-2">
              {canShareFiles() && (
                <Button className="flex-1" onClick={doShare} disabled={Boolean(busy)}>
                  📤 {t('settings.shareBackup')}
                </Button>
              )}
              <Button
                variant={canShareFiles() ? 'secondary' : 'primary'}
                className="flex-1"
                onClick={doExport}
                disabled={Boolean(busy)}
              >
                💾 {t('settings.export')}
              </Button>
            </div>

            <hr className="border-slate-200 dark:border-slate-800" />

            <div>
              <p className="font-semibold">{t('settings.restore')}</p>
              <p className="mt-0.5 mb-3 text-sm text-slate-500 dark:text-slate-400">
                {t('settings.restoreDesc')}
              </p>
              <Button
                variant="secondary"
                full
                onClick={() => fileRef.current?.click()}
                disabled={Boolean(busy)}
              >
                📂 {t('settings.restore')}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  void onFilePicked(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
          </Card>

          {storage && (
            <Card className="mt-3">
              <p className="text-sm font-medium">
                {t('settings.storage')}: {formatBytes(storage.usage)}
                {storage.quota > 0 && (
                  <span className="text-slate-400"> / {formatBytes(storage.quota)}</span>
                )}
              </p>
              {persisted !== undefined && (
                <p
                  className={cx(
                    'mt-1 text-xs',
                    persisted ? 'text-brand-700 dark:text-brand-400' : 'text-amber-600',
                  )}
                >
                  {persisted ? `✅ ${t('settings.storagePersisted')}` : `⚠️ ${t('settings.storageNotPersisted')}`}
                </p>
              )}
            </Card>
          )}
        </Section>

        <Section title={t('settings.about')}>
          <Card>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {t('settings.aboutOffline')}
            </p>
          </Card>
        </Section>

        <Section title={t('settings.dangerZone')}>
          <Card className="!ring-red-200 dark:!ring-red-900">
            <p className="font-semibold text-red-700 dark:text-red-400">
              {t('settings.clearAll')}
            </p>
            <p className="mt-0.5 mb-3 text-sm text-slate-500 dark:text-slate-400">
              {t('settings.clearAllDesc')}
            </p>
            <Button variant="danger" full onClick={doClearAll}>
              {t('settings.clearAll')}
            </Button>
          </Card>
        </Section>
      </div>

      {/* Restore mode chunna — replace irreversible hai isliye alag se poochte hain. */}
      <Sheet
        open={Boolean(pendingBackup)}
        onClose={() => setPendingBackup(undefined)}
        title={t('settings.importMode')}
      >
        <div className="space-y-3">
          <button
            onClick={() => doRestore('merge')}
            className="w-full rounded-xl bg-white p-4 text-start ring-1 ring-slate-200 active:bg-slate-50 dark:bg-slate-800 dark:ring-slate-700"
          >
            <p className="font-semibold">{t('settings.importMerge')}</p>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {t('settings.importMergeDesc')}
            </p>
          </button>
          <button
            onClick={() => doRestore('replace')}
            className="w-full rounded-xl bg-white p-4 text-start ring-1 ring-red-200 active:bg-red-50 dark:bg-slate-800 dark:ring-red-900"
          >
            <p className="font-semibold text-red-700 dark:text-red-400">
              {t('settings.importReplace')}
            </p>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {t('settings.importReplaceDesc')}
            </p>
          </button>
        </div>
      </Sheet>

      {busy && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/40">
          <div className="flex items-center gap-3 rounded-2xl bg-white px-6 py-4 dark:bg-slate-900">
            <Spinner />
            <span className="font-medium">{busy}</span>
          </div>
        </div>
      )}
    </div>
  )
}
