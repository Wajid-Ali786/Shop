import { useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { compressImage } from '../lib/images'
import { Button, Spinner } from './ui'

/**
 * Camera ya gallery se tasveer leta hai, compress kar ke Blob wapas deta hai.
 * Blob DB me tab save hota hai jab poora form save ho — is se cancel karne par
 * orphan images nahi banti.
 */
export function ImagePicker({
  previewUrl,
  onPick,
  onRemove,
}: {
  previewUrl?: string
  onPick: (blob: Blob) => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const handleFile = async (file?: File) => {
    if (!file) return
    setBusy(true)
    setError(undefined)
    try {
      const { blob } = await compressImage(file)
      onPick(blob)
    } catch {
      setError(t('error.imageFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          {busy ? (
            <div className="flex h-full w-full items-center justify-center text-slate-400">
              <Spinner />
            </div>
          ) : previewUrl ? (
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl opacity-40">
              📷
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 !min-h-11 !text-sm"
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
            >
              📷 {t('form.takePhoto')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1 !min-h-11 !text-sm"
              onClick={() => galleryRef.current?.click()}
              disabled={busy}
            >
              🖼️ {t('form.choosePhoto')}
            </Button>
          </div>
          {previewUrl && !busy && (
            <button
              type="button"
              onClick={onRemove}
              className="self-start text-sm font-medium text-red-600 active:opacity-70"
            >
              {t('form.removePhoto')}
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}

      {/* capture="environment" phone par seedha back camera kholta hai. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
