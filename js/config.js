/**
 * Firebase project ki details.
 *
 * Badalni hon to: Firebase Console → Project settings (⚙️) → "Your apps"
 * → Web app (</> wala icon) → "Config".
 *
 * Tafseeli hidayat: FIREBASE-SETUP.md
 *
 * NOTE: Ye values SECRET NAHI hain. Firebase ka web config public hone ke
 * liye hi banaya gaya hai — har website ke source me nazar aata hai. Aap ka
 * data "firestore.rules" se mehfooz hai, in values ko chhupane se nahi.
 * Isi wajah se login (Firebase Auth) lagana zaroori hai.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyBkHRx3XIFwvpL6CuWP255LjawRXgwI7tc',
  authDomain: 'shop-5060.firebaseapp.com',
  projectId: 'shop-5060',
  storageBucket: 'shop-5060.firebasestorage.app',
  messagingSenderId: '580913428536',
  appId: '1:580913428536:web:4a98e07afaa27bf7ed8ecd',
  // measurementId sirf Google Analytics ke liye hota hai — ye app Analytics
  // istemaal nahi karti, isliye yahan nahi rakha.
}

/** Config bhara hua hai ya nahi — app shuru me yahi check karti hai. */
export function isConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)
}
