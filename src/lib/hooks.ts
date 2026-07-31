import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getImage, loadSettings } from '../db/repo'
import type { AppSettings } from '../db/types'
import { DEFAULT_SETTINGS } from '../db/types'
import { db } from '../db'

/**
 * IndexedDB me rakhi image ka object URL deta hai aur unmount par revoke kar
 * deta hai — warna list scroll karte karte memory bharti chali jati hai.
 */
export function useImageUrl(imageId?: string): string | undefined {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    if (!imageId) {
      setUrl(undefined)
      return
    }
    let revoked = false
    let objectUrl: string | undefined

    getImage(imageId)
      .then((blob) => {
        if (!blob || revoked) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => setUrl(undefined))

    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setUrl(undefined)
    }
  }, [imageId])

  return url
}

/** Settings live — kisi bhi screen se badle to sab jagah update ho jati hain. */
export function useSettings(): AppSettings {
  const rows = useLiveQuery(() => db.settings.toArray(), [], undefined)
  if (!rows) return DEFAULT_SETTINGS
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return { ...DEFAULT_SETTINGS, ...stored } as AppSettings
}

export function useSettingsAsync(): AppSettings | undefined {
  const [settings, setSettings] = useState<AppSettings>()
  useEffect(() => {
    loadSettings().then(setSettings).catch(() => setSettings(DEFAULT_SETTINGS))
  }, [])
  return settings
}

/** Search box har keystroke par poori list filter na kare. */
export function useDebounced<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** Chhota toast — save/delete ke baad confirmation dikhane ke liye. */
export function useToast() {
  const [message, setMessage] = useState<string>()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const show = (text: string, ms = 2200) => {
    setMessage(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(undefined), ms)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  return { message, show }
}
