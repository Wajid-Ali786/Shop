# Karyana Shop

Chhoti karyana shops ke liye mobile-first product aur stock management web app.

Plain **HTML + CSS + JavaScript** — koi framework nahi, koi build step nahi.
Repo ki files seedha GitHub Pages par chal jaati hain. Data aap ke apne
**Firebase** project me rehta hai, aur app internet ke bagair bhi chalti hai.

---

## Pehle ye karein

Setup ek baar karna hai (~10 minute, bilkul free):

**➡️ [FIREBASE-SETUP.md](FIREBASE-SETUP.md)**

Us ke bagair app sirf "Firebase setup needed" wali screen dikhayegi.

---

## Features

- **Products** — tasveer (camera se), bechne aur khareedne ka rate, categories,
  miyaad ki tareekh, barcode
- **Khuli ya packet** — har product ke liye tay karein ke wo tol kar bikti hai
  ya gin kar. Cold drink 1.5L par stock `6` likhein to **"6 bottle"** aata hai,
  "6 litre" nahi — aur detail par kul `9 L` bhi
- **Ek product, kai categories** — chawal "Grains" me bhi ho sakta hai aur
  "Ramzan Special" me bhi
- **Ek tap me stock** — product ki row par hi `−` aur `+`; badge par tap karein
  to poora sheet (miqdaar, wajah, note)
- **Chhupe hue search tags** — list me kabhi nazar nahi aate, sirf search inhe parhta hai.
  Likhte waqt pehle se istemaal shuda tags tajweez hote hain, taake ek hi cheez
  ke teen alag hijje na banein
- **Samajhdar search** — Roman Urdu, Urdu aur English, hijje ki galti ke saath bhi:
  `chawal` / `chaawal` / `chawl` / `چاول` — chaaron se ek hi product milta hai
- **Stock** — kilo, gram, litre, ml, adad, darjan, packet, bori.
  `250 g` likhein to `0.25 kg` ban jata hai
- **Stock history** — har tabdeeli ka record: kab, kitna, kis wajah se
  (naya maal aaya / becha / kharab hua / ginti durust ki)
- **Manganay ki list** — jo cheezein khatam ya kam hain, ek tap me supplier ko WhatsApp par
- **Miyaad ke alerts** — 30 din ke andar khatam hone wali cheezein alag
- **Dashboard** — kitne products, stock ki maliyat, kam stock, haalia sargarmi
- **English + اردو** — poora RTL layout
- **Dark mode**
- **Har phone se** — apne email/password se kisi bhi device par login karein
- **Account controls** — Settings me se email aur password khud badal sakte hain
- **Grahak wali fehrist** — chaahein to site kholne wale ko bina login ke
  sirf tasveer, naam, rate aur stock dikha sakte hain. Khareed rate, chhupe
  tags aur stock history kabhi baahar nahi jaate
- **Backup** — poora data (tasveerein samet) ek file me; wapas laane par
  "shamil karein" ya "sab badal dein" ka ikhtiyar. Muqarrara din guzarne par
  home screen khud yaad dilati hai
- **Phone par install** — Settings se home screen par apna icon; app poori
  screen par khulti hai aur internet ke baghair bhi chalti hai
- **Upar se kheench kar taza** — jaise doosri apps me hota hai

---

## Data kahan hai

Aap ke **apne Firebase project** me — Google ke server par, aap ke account ke neeche.
Har user sirf apna data dekh sakta hai (dekhein [`firestore.rules`](firestore.rules)).

Firestore apni ek copy phone me bhi rakhta hai, is liye:

- Internet chala jaye to app chalti rehti hai
- Jo tabdeeliyan aap karte hain wo mehfooz rehti hain aur internet aate hi khud sync ho jaati hain
- Phone gum ho jaye to bhi data mehfooz hai — naye phone par login karein, sab wapas

Tasveerein bhi Firestore me hi rehti hain (compress ho kar ~60 KB), taake
Firebase Storage ki zaroorat na pare — wo naye projects me credit card maangta hai.

---

## Structure

```
index.html              app ka waahid HTML page
manifest.webmanifest    "Add to Home Screen" ke liye
sw.js                   service worker — offline cache
firestore.rules         database ki hifazat (Firebase me publish karni hai)
css/app.css             saari styling
assets/                 icons
js/
  config.js             ← YAHAN apni Firebase config daalein
  firebase.js           Firebase init + login
  store.js              saara database access sirf yahan se
  app.js                routing aur screens jorne wala hissa
  components.js         chhote reusable HTML tukde
  i18n/                 English + Urdu
  lib/                  search, units, format, images, router, theme, dom,
                        backup, install, paging, pull-refresh, dragscroll, modal
  screens/              welcome, catalog, login, account, dashboard, products,
                        form, detail, stock, categories, settings
```

Firestore ko koi screen seedha nahi chhuti — sab kuch `js/store.js` se guzarta hai.
Kal ko database badalna ho to sirf wahi ek file badlegi.

---

## Locally chalana

Kyunki app ES modules istemaal karti hai, `index.html` ko seedha double-click se
kholna kaam nahi karega. Koi bhi chhota server chalayein:

```bash
python3 -m http.server 5500
# phir kholein: http://localhost:5500
```

`localhost` Firebase me pehle se authorized hota hai.

---

## Stock kaise badalta hai

Product edit form se stock nahi badalta. Teen tareeqe hain:

1. **Row par `−` / `+`** — ek tap, foran. Kam karna "becha" aur barhana "naya maal
   aaya" ke tor par history me jata hai
2. **Badge par tap** — poora sheet: miqdaar, wajah, note
3. **Ginti** — "abhi asal me itna para hai"

Teenon `adjustStock()` / `setStockCount()` se guzarte hain (`js/store.js`), jo
product ka `stockQty` aur `movements` ka record **ek hi Firestore transaction**
me likhte hain. Is liye history kabhi asal stock se mismatch nahi hoti, chahe do
phone ek saath chal rahe hon.

## Media (tasveerein) kahan hain

Camera se aayi tasveer 640px tak chhoti ho kar WebP me compress hoti hai (~50-70 KB),
phir **`shops/{uid}/images/{id}`** me jati hai — product ke apne document me nahi.
Product me sirf `imageId` hota hai.

Wajah: pehle tasveer product ke document ke andar thi, to products ki list load
karne par har tasveer bhi download hoti thi (200 products ≈ 19 MB). Ab list halki
hai aur tasveer sirf zaroorat par aati hai.

Firebase **Storage** istemaal nahi kiya kyunki wo naye projects me credit card
maangta hai — ye tareeqa free (Spark) plan me chalta hai.
