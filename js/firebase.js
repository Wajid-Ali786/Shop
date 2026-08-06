/**
 * Firebase ka setup. Yahan koi build step nahi — Firebase ke official ES
 * modules seedha Google ke CDN se import ho rahe hain, isliye ye file browser
 * me waise hi chalti hai jaise likhi hai.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js'
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  verifyBeforeUpdateEmail,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js'

import { firebaseConfig, isConfigured } from './config.js'

export let app = null
export let auth = null
export let dbf = null

export function initFirebase() {
  if (!isConfigured()) return false
  if (app) return true

  app = initializeApp(firebaseConfig)
  auth = getAuth(app)

  // Offline cache: dukan par internet chala jaye to bhi app chalti rahe.
  // Firestore likhi hui cheezein cache me rakhta hai aur wapas online hone
  // par khud sync kar deta hai.
  dbf = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
  })

  return true
}

// ------------------------------------------------------------------ auth

export function watchAuth(callback) {
  if (!auth) return () => {}
  return onAuthStateChanged(auth, callback)
}

export async function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password)
}

export async function signUp(email, password) {
  return createUserWithEmailAndPassword(auth, email.trim(), password)
}

export async function signOut() {
  return fbSignOut(auth)
}

export function currentUid() {
  return auth?.currentUser?.uid ?? null
}

export function currentEmail() {
  return auth?.currentUser?.email ?? ''
}

// -------------------------------------------------------- account settings

/**
 * Firebase email/password badalne se pehle "haal hi me login" maangta hai.
 * Har tabdeeli se pehle maujooda password se dobara tasdeeq kar lete hain —
 * is se `auth/requires-recent-login` wali pareshani aati hi nahi, aur koi
 * doosra shakhs khuli hui app par aa kar password nahi badal sakta.
 */
async function reauthenticate(currentPassword) {
  const user = auth?.currentUser
  if (!user?.email) throw new Error('Sign in nahi kiya hua')
  const credential = EmailAuthProvider.credential(user.email, currentPassword)
  await reauthenticateWithCredential(user, credential)
  return user
}

/**
 * Sirf tasdeeq: "kya ye wahi shakhs hai?"
 *
 * "Ye mera apna phone hai" chalu karte waqt istemaal hota hai. Password poochna
 * yahan do kaam karta hai: mehfooz karne ke liye asal password mil jata hai,
 * aur kaunter par khari koi ajnabi ye switch chalu nahi kar sakti.
 */
export async function verifyPassword(currentPassword) {
  await reauthenticate(currentPassword)
}

export async function changePassword(currentPassword, newPassword) {
  const user = await reauthenticate(currentPassword)
  await updatePassword(user, newPassword)
}

/**
 * Naya email FORAN nahi badalta: Firebase naye pate par tasdeeqi link bhejta
 * hai, aur email tab badalta hai jab user us link par click kare. Purana email
 * tab tak chalta rehta hai — is se ghalat pata daal kar account gum nahi hota.
 */
export async function changeEmail(currentPassword, newEmail) {
  const user = await reauthenticate(currentPassword)
  await verifyBeforeUpdateEmail(user, newEmail.trim())
}

/** Password bhool jane par — reset link email par jata hai. */
export async function sendPasswordReset(email) {
  await sendPasswordResetEmail(auth, email.trim())
}

/** Firebase ke error codes ko aam zabaan me badalta hai. */
export function authErrorKey(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'auth.errInvalidEmail'
    case 'auth/missing-password':
    case 'auth/weak-password':
      return 'auth.errWeakPassword'
    case 'auth/email-already-in-use':
      return 'auth.errEmailInUse'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'auth.errWrongCredentials'
    case 'auth/too-many-requests':
      return 'auth.errTooMany'
    case 'auth/network-request-failed':
      return 'auth.errNetwork'
    case 'auth/operation-not-allowed':
      return 'auth.errNotEnabled'
    // Project me Authentication abhi setup hi nahi hui.
    case 'auth/configuration-not-found':
      return 'auth.errNoAuthSetup'
    // Site ka domain Firebase ki authorized list me nahi hai.
    case 'auth/unauthorized-domain':
      return 'auth.errUnauthorizedDomain'
    default:
      return 'auth.errGeneric'
  }
}
