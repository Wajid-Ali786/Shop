# Tests

Asli app, asli browser, asli Firestore rules — bas asli dukan ka data chhue
baghair.

Har test Chromium me wahi app chalata hai jo dukandar ke phone par chalti hai,
aur us ke peeche Firebase ka **emulator** hota hai. Sirf teen cheezein badalti
hain: `js/config.js` (test project), `js/firebase.js` me emulator se jurne ki do
lines, aur — sirf zaroorat par — Firebase SDK ki local copy. Baqi sab kuch wahi
code hai jo live jata hai, is liye ye test app ki asal ghaltiyan pakarte hain,
apni banai hui naqal ki nahi.

`firestore.rules` bhi wahi file hai jo Firebase me publish hoti hai — emulator
usay seedha `../firestore.rules` se parhta hai.

---

## Chalane ka tareeqa

Ek baar:

```bash
cd tests
npm install
npx playwright install chromium
```

Phir **teen alag terminal** me:

```bash
# 1 — Firebase emulator
cd tests && npm run emulators

# 2 — app ka server
cd tests && npm run serve

# 3 — test
cd tests && npm test
```

Sirf ek hissa chalana ho:

```bash
npm test khata      # sirf khata
npm test rules      # sirf Firestore rules
npm test khata dates
```

---

## Kya kya check hota hai

| Spec | Kya dekhta hai |
|---|---|
| `app.mjs` | Poora rozana ka safar: account, products, stock, categories, backup/restore, grahak wali list, aur data ki hifazat |
| `khata.mjs` | Udhaar khata: chaar qismein, jama ka alag hisaab, tafseel, entry badalna/mitana, multi-select |
| `offline.mjs` | Internet band ho to kaam ruke nahi, aur signal aate hi sab server par pahunche |
| `dates.mjs` | Lein dein ki tareekh dukandar chunta hai, aur badalne par hisaab dobara bane |
| `history.mjs` | Purani stock history saaf karna — aur stock ki ginti ka na badalna |
| `rules.mjs` | Firestore rules khud: ghalat data ruke, sahi data guzre |

`rules.mjs` jaan boojh kar app ka raasta chhor kar **seedha Firestore** par
likhne ki koshish karta hai. Warna wo app ki apni jaanch ko test karta, rules ko
nahi — aur asal khatra to wahi hai jo app ko bypass kar ke aaye.

---

## Test likhne ka tareeqa

`tests/specs/` me nayi `.mjs` file — runner khud utha lega.

```js
import { launch, check, finish, signUp, BASE, realErrors } from '../lib/harness.mjs'

const h = await launch()          // browser + saaf emulator
const { page, browser, errors } = h
const { text, readStore } = h

await signUp(page, 'meratest')    // naya account, dukan ke andar

check('Ye baat sach honi chahiye', 2 + 2 === 4, 'tafseel yahan')

await finish(browser)             // ginti likh kar sahi exit code
```

`readStore(fn)` browser ke andar chal kar app ke `store.js` ya seedha Firestore
se parhta hai — us se wo baatein dekhi ja sakti hain jo screen par nazar nahi
aatin (jaise `balanceAfter` ki poori zanjeer).

Har run se pehle emulator **poora khali** kar diya jata hai. Ye zaroori hai:
warna pichhle run ka `publicIndex/default` ka claim reh jata hai aur agle run ki
dukan usay le hi nahi sakti.

---

## Band network wale mahol me

Kuch mahol me `gstatic.com` tak pahunch nahi hoti (jahan se Firebase SDK aati
hai). Us soorat me SDK ki teen files `tests/vendor/` me rakh dein:

```
tests/vendor/firebase-app.js
tests/vendor/firebase-auth.js
tests/vendor/firebase-firestore.js
```

Mojood hon to harness khud unhein parosta hai; na hon to seedha gstatic se aati
hain. App ka code dono soorton me ek hi rehta hai.

Playwright ka apna Chromium na ho to raasta batayein:

```bash
CHROMIUM_PATH=/path/to/chrome npm test
```
