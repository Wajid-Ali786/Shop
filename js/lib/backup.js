import { toast } from './dom.js'
import { t } from '../i18n/index.js'
import { buildExport, saveSetting, photoCount, estimatedBackupBytes } from '../store.js'
import { chooseModal } from './modal.js'

/**
 * Is se bara backup WhatsApp par bhejna mushkil ho jata hai — wahan ki hadd
 * 100 MB hai magar 2G par 6 MB bhi na-mumkin lagta hai. Is hadd se neeche
 * kuch nahi poochha jata: dukandar ko har backup par ek fazool sawal dena
 * usay backup se hi bezaar kar dega.
 */
const ASK_ABOVE_BYTES = 6 * 1024 * 1024

/**
 * Backup ki file banana aur download karna.
 *
 * Ye alag file me is liye hai ke do jagah se chalta hai: Settings ka button,
 * aur home screen wala yaad-dihani ka card. Pehle sirf Settings me tha aur
 * card wahan le jata tha — magar card par likha hota hai "Save a backup", to
 * dukandar ke nazdeek dabate hi backup ban jana chahiye. Ab dono jagah wahi
 * ek kaam hota hai.
 */
export async function saveBackup({ withImages = true } = {}) {
  // Tasveerein aur poori movements server se aati hain, is liye await.
  const data = await buildExport({ withImages })
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  // Halki file ka naam alag rakha jata hai. Do saal baad folder me se file
  // uthate waqt sirf naam hi bata sakta hai ke is me tasveerein hain ya nahi.
  a.download = `karyana-${new Date().toISOString().slice(0, 10)}${withImages ? '' : '-light'}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)

  // Tareekh file ban jane ke BAAD likhi jati hai, warna nakam backup bhi
  // "ho gaya" gina jata aur yaad-dihani chup ho jati.
  //
  // Halki file bhi backup gini jati hai: is me poora hisaab, poora khata aur
  // poori products ki list mojood hai. Sirf tasveerein nahi — aur wo dobara
  // khinchi ja sakti hain, udhaar ka hisaab dobara nahi ban sakta.
  await saveSetting('lastBackupAt', Date.now())
}

/** Wahi kaam, magar button ki halat, sawal aur paighaam ke saath. */
export async function runBackup(button) {
  if (button) button.disabled = true
  try {
    const withImages = await askAboutPhotos()
    if (withImages === null) return false

    await saveBackup({ withImages })
    toast(t('settings.exported'))
    return true
  } catch (err) {
    toast(err?.code === 'permission-denied' ? t('error.permission') : t('error.generic'))
    return false
  } finally {
    if (button) button.disabled = false
  }
}

/**
 * Sirf tab poochha jata hai jab file waqai bhaari ho.
 *
 * Chhoti dukan me — jahan das bees tasveerein hain — file do teen MB ki hai
 * aur koi sawal bay-maani hai. Bari dukan me wahi file 40 MB ki ban jati hai
 * aur phone se nikalti hi nahi. Sawal wahin aata hai jahan us ka jawab kuch
 * badalta hai.
 *
 * `null` ka matlab: dukandar ne modal band kar diya, backup nahi banana.
 */
async function askAboutPhotos() {
  const photos = photoCount()
  const bytes = estimatedBackupBytes()
  if (bytes <= ASK_ABOVE_BYTES) return true

  const choice = await chooseModal({
    title: t('settings.export'),
    message: t('settings.backupBigMessage', { size: formatSize(bytes), photos }),
    options: [
      {
        value: 'full',
        label: t('settings.backupWithPhotos', { size: formatSize(bytes) }),
        description: t('settings.backupWithPhotosDesc'),
      },
      {
        value: 'light',
        label: t('settings.backupNoPhotos'),
        description: t('settings.backupNoPhotosDesc'),
      },
    ],
  })

  return choice === 'full' ? true : choice === 'light' ? false : null
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024)
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`
}
