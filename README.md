# Karyana Shop

Chhoti karyana shops ke liye mobile-first **offline** product aur stock management app.
Phone par install ho jati hai (PWA) aur internet ke bagair poori chalti hai.

## Features

- **Products** — image (camera se), sale/purchase/thok price, category, unit, stock, expiry date, barcode
- **Hidden search tags** — product list me nazar nahi aate, sirf search inhe parhta hai
- **Smart search** — Roman Urdu, Urdu script aur English, spelling ki galti ke saath bhi
  (`chawal` / `chaawal` / `chawl` / `چاول` — sab se ek hi product milta hai)
- **Stock** — kg, gram, litre, ml, piece, dozen, packet, bori. `250 g` likhein to `0.25 kg` ban jata hai
- **Stock history** — har tabdeeli ka record: kab, kitna, kis wajah se (naya maal / becha / kharab / ginti)
- **Reorder list** — jo cheezein khatam ya kam hain, unki list seedha WhatsApp par supplier ko bhejein
- **Expiry alerts** — 30 din ke andar khatam hone wali cheezein alag dikhti hain
- **Dashboard** — total products, stock ki maliyat, low stock, expiring soon
- **Backup / Restore** — poora data (tasveerein samet) ek file me; WhatsApp/Drive par share bhi
- **English + Urdu (اردو)** — poora RTL layout
- **Dark mode**

## Chalane ka tareeqa

```bash
npm install
npm run dev        # development
npm run build      # production build → dist/
npm run preview    # build ko locally chala kar dekhein
```

Phone par test karne ke liye `npm run dev -- --host` chalayein aur phone ke browser me
network URL kholein, phir **"Add to Home Screen"**.

## Data kahan rehta hai

Saara data aap ke **apne device ke IndexedDB me** hai. Koi server nahi, koi account nahi,
kuch bhi kahin upload nahi hota.

> **Ehtiyaat:** Phone gum ho jaye, ya browser ka data clear ho jaye, to data wapas nahi aata.
> Isliye Settings → Backup se hafte me ek baar backup zaroor lein. App khud bhi 7 din baad
> home screen par yaad dilati hai.

App pehli baar khulne par `navigator.storage.persist()` maangti hai, taake storage kam hone
par browser ye data khud se delete na kare.

## Structure

```
src/
  db/         Dexie schema, types, repo (saara data access), backup/restore
  lib/        search (normalize + fuzzy), images (compress), units, format, router, theme
  i18n/       Context + English/Urdu dictionaries
  components/ ui primitives, ProductCard, TagInput, ImagePicker, StockAdjustSheet, BottomNav
  screens/    Dashboard, Products, ProductForm, ProductDetail, Stock, Categories, Settings
```

Saara database access `src/db/repo.ts` se guzarta hai. Kal ko cloud sync ya multi-device
chahiye ho to sirf wahi layer badalni paray gi — screens ko haath lagane ki zaroorat nahi.

## Stock kaise badalta hai

Stock sirf `adjustStock()` / `setStockCount()` se badalta hai (`src/db/repo.ts`), aur dono
product ka `stockQty` + `stockMovements` ka record **ek hi transaction** me likhte hain —
is liye history kabhi asal stock se mismatch nahi hoti.

Product edit form se stock nahi badla ja sakta; uske liye "Adjust stock" hai.
