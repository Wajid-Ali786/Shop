import { toast } from './dom.js'
import { t } from '../i18n/index.js'
import { buildExport, saveSetting } from '../store.js'

/**
 * Backup ki file banana aur download karna.
 *
 * Ye alag file me is liye hai ke do jagah se chalta hai: Settings ka button,
 * aur home screen wala yaad-dihani ka card. Pehle sirf Settings me tha aur
 * card wahan le jata tha — magar card par likha hota hai "Save a backup", to
 * dukandar ke nazdeek dabate hi backup ban jana chahiye. Ab dono jagah wahi
 * ek kaam hota hai.
 */
export async function saveBackup() {
  // Tasveerein aur poori movements server se aati hain, is liye await.
  const data = await buildExport()
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `karyana-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)

  // Tareekh file ban jane ke BAAD likhi jati hai, warna nakam backup bhi
  // "ho gaya" gina jata aur yaad-dihani chup ho jati.
  await saveSetting('lastBackupAt', Date.now())
}

/** Wahi kaam, magar button ki halat aur paighaam ke saath. */
export async function runBackup(button) {
  if (button) button.disabled = true
  try {
    await saveBackup()
    toast(t('settings.exported'))
    return true
  } catch (err) {
    toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
    return false
  } finally {
    if (button) button.disabled = false
  }
}
