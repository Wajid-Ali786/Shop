/**
 * YAHAN APNI FIREBASE PROJECT KI DETAILS DAALEIN
 * ==============================================
 *
 * Firebase Console → apna project → Project settings (⚙️) → "Your apps"
 * → Web app (</> wala icon) → "Config" chunein. Wahan se poora object
 * copy kar ke neeche paste kar dein.
 *
 * Tafseeli hidayat: FIREBASE-SETUP.md
 *
 * NOTE: Ye values SECRET NAHI hain. Firebase ka web config public hone ke
 * liye hi banaya gaya hai — har website ke source me nazar aata hai. Aap ka
 * data "firestore.rules" se mehfooz hai, in values ko chhupane se nahi.
 * Isi wajah se login (Firebase Auth) lagana zaroori hai.
 */
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
}

/** Config bhara hua hai ya nahi — app shuru me yahi check karti hai. */
export function isConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)
}
