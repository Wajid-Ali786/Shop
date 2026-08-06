/**
 * "Ye mera apna phone hai" — login ke khane khud bhare hue aayein.
 *
 * Ye cheez JAAN BOOJH KAR is phone tak mehdood hai, dukan ke data me nahi
 * jati. Wajah saaf hai: sign out ke baad Firestore tak pahunch hi nahi hoti,
 * aur "ye phone bharosay ka hai" ka faisla waise bhi phone ka hai, dukan ka
 * nahi. Dukandar ka apna phone bharosay ka ho sakta hai aur kaunter wala
 * doosra phone nahi.
 *
 * ⚠️ Sach saaf saaf: password yahan is phone ke storage me MEHFOOZ hota hai.
 * `btoa` sirf is liye lagaya hai ke storage kholte hi wo saamne na parha jaye
 * — ye HIFAZAT NAHI hai, aur jo dhoondna chahe use mil jayega. Is liye Settings
 * me is ke saath tanbeeh likhi hai aur ye by default BAND hai. Dukandar khud
 * chalu kare tab hi chalta hai.
 */

const FLAG = 'karyana.trustedDevice'
const SAVED = 'karyana.savedLogin'

/** Is phone par khane khud bharne hain? */
export function isTrusted() {
  try {
    return localStorage.getItem(FLAG) === '1'
  } catch {
    return false // private mode
  }
}

/**
 * Chalu/band karna.
 *
 * Band karte hi mehfooz kiya hua sab kuch foran mit jata hai — warna "band kar
 * diya" kehne ke bawajood password phone me para rehta, jo sab se bura dhoka
 * hota.
 */
export function setTrusted(on) {
  try {
    if (on) {
      localStorage.setItem(FLAG, '1')
    } else {
      localStorage.removeItem(FLAG)
      localStorage.removeItem(SAVED)
    }
  } catch {
    // Private mode — is session ke baad waise bhi kuch nahi bachta.
  }
}

/** Kamyab login ke baad — sirf tab jab dukandar ne khud ijazat di ho. */
export function rememberLogin(email, password) {
  if (!isTrusted()) return
  try {
    localStorage.setItem(SAVED, btoa(JSON.stringify({ email, password })))
  } catch {
    // Storage bhara hua ya band — auto-fill na sahi, login phir bhi chalta hai.
  }
}

/** Login screen ke liye: `{ email, password }` ya `null`. */
export function savedLogin() {
  if (!isTrusted()) return null
  try {
    const raw = localStorage.getItem(SAVED)
    if (!raw) return null
    const value = JSON.parse(atob(raw))
    return value?.email ? value : null
  } catch {
    return null // kharab ho gaya to bhool jao
  }
}

/** Mehfooz kiya hua mita do (toggle band, ya password ghalat nikla). */
export function forgetLogin() {
  try {
    localStorage.removeItem(SAVED)
  } catch {
    // kuch nahi
  }
}

/**
 * Password badal jaye to yahan bhi naya likh do.
 *
 * Is ke baghair agli dafa purana password khud bhar kar "ghalat password" ka
 * paighaam deta — aur dukandar ko samajh hi na aata ke usne to abhi badla tha.
 */
export function updateSavedPassword(password) {
  const saved = savedLogin()
  if (saved) rememberLogin(saved.email, password)
}
