# Firebase setup — qadam ba qadam

Ye app aap ka data **aap ke apne** Firebase project me rakhti hai. Setup ek baar
karna hai, taqreeban 10 minute lagte hain, aur **bilkul free** hai (Spark plan —
credit card ki zaroorat nahi).

---

## 1. Firebase project banayein

1. [console.firebase.google.com](https://console.firebase.google.com) kholein aur
   apne Google account se sign in karein.
2. **"Create a project"** dabayein.
3. Project ka naam likhein, maslan `karyana-shop`.
4. Google Analytics ki zaroorat nahi — **off** kar dein.
5. **Create project** dabayein aur intezar karein.

---

## 2. Web app add karein aur config lein

1. Project ke home page par **`</>`** (Web) wale icon par click karein.
2. App ka nickname likhein (maslan `karyana-web`). **Firebase Hosting ka checkbox
   NA lagayein** — hum GitHub Pages istemaal kar rahe hain.
3. **Register app** dabayein.
4. Ab jo code screen par aayega, us me se `firebaseConfig` wala object copy karein:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "karyana-shop.firebaseapp.com",
  projectId: "karyana-shop",
  storageBucket: "karyana-shop.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123"
};
```

5. Is repo me **`js/config.js`** kholein aur wahan values bhar dein:

```js
export const firebaseConfig = {
  apiKey: 'AIzaSy...',
  authDomain: 'karyana-shop.firebaseapp.com',
  projectId: 'karyana-shop',
  storageBucket: 'karyana-shop.appspot.com',
  messagingSenderId: '123456789012',
  appId: '1:123456789012:web:abc123',
}
```

> **Ye values secret nahi hain.** Firebase ka web config har website ke source me
> nazar aata hai — isi liye banaya gaya hai. Aap ka data **qadam 4** wale rules se
> mehfooz hota hai. Isi wajah se login lagana zaroori hai.

---

## 3. Login (Authentication) on karein

1. Bayen menu se **Build → Authentication** → **Get started**.
2. **Sign-in method** tab me **Email/Password** chunein.
3. Pehla toggle **Enable** karein (doosra "Email link" rehne dein).
4. **Save** dabayein.

Account banane ki zaroorat nahi — app me pehli baar **"Create account"** se aap
khud bana lenge.

---

## 4. Database aur rules (ye qadam sab se ahem hai)

1. Bayen menu se **Build → Firestore Database** → **Create database**.
2. Location chunein — Pakistan ke liye **`asia-south1` (Mumbai)** sab se qareeb hai.
3. **"Start in production mode"** chunein → **Create**.
4. Ab **Rules** tab kholein.
5. Wahan jo bhi likha hai wo sab mita dein, aur is repo ki **`firestore.rules`**
   file ka poora content paste kar dein.
6. **Publish** dabayein.

Ye rules kehti hain: har user sirf apna shop data parh/likh sakta hai. Ye qadam
chhod diya to ya to app chalegi hi nahi, ya (test mode me) aap ka data har kisi
ke liye khula ho jayega.

---

## 5. Apni site ka domain authorize karein

Firebase sirf un websites se login qubool karta hai jo aap ne list ki hon.

1. **Authentication → Settings → Authorized domains**.
2. **Add domain** dabayein.
3. Apna GitHub Pages domain likhein — `wajid-ali786.github.io`
   (sirf domain, `/Shop` wala hissa nahi).

`localhost` pehle se list me hota hai, is liye apne computer par testing chal jayegi.

---

## 6. GitHub Pages on karein

1. GitHub par is repo me **Settings → Pages**.
2. **Source**: `Deploy from a branch`.
3. **Branch**: `main` (ya jo bhi branch aap istemaal kar rahe hain), folder `/ (root)`.
4. **Save**.

Ek do minute baad site yahan chal rahi hogi:
`https://wajid-ali786.github.io/Shop/`

Koi build step nahi hai — repo ki files seedha serve hoti hain.

---

## 7. Pehli baar app kholein

1. Site kholein.
2. **"First time? Create your shop account"** dabayein.
3. Apna email aur ek password (kam se kam 6 harf) daal kar account bana lein.
4. Bas — categories khud ban jayengi, ab products daalna shuru karein.

Isi email/password se aap **kisi bhi phone ya computer** se apni dukan khol sakte hain.

---

## Masle aur unka hal

| Masla | Wajah aur hal |
|---|---|
| **"Firebase refused this"** wala laal banner | `firestore.rules` publish nahi huye. Qadam 4 dobara karein. |
| **"Email/Password sign-in is not enabled"** | Qadam 3 reh gaya. |
| Login par `auth/unauthorized-domain` | Qadam 5 reh gaya — apna GitHub Pages domain add karein. |
| Site khali safed | Browser ka console (F12) kholein. Aksar `js/config.js` khali reh jata hai. |
| Site par purani version nazar aati hai | GitHub Pages ka cache. Hard refresh: `Ctrl+Shift+R` (phone par browser data clear). |

---

## Kya ye free rehta hai?

Ji haan. Firebase ka Spark (free) plan rozana deta hai:

- **50,000** document reads
- **20,000** document writes
- **1 GB** storage

Ek karyana shop is ka bohat chhota hissa istemaal karti hai. App tasveerein bhi
Firestore me hi rakhti hai (compress kar ke ~60 KB har ek), taake Firebase Storage
ki zaroorat na pare — kyunki Storage naye projects me credit card maangta hai.
