/**
 * Upar se neeche kheench kar data taza karna.
 *
 * Firestore ke live listeners waise bhi khud data laate rehte hain, is liye
 * technically ye zaroori nahi. Zaroori is liye hai ke dukandar ko YAQEEN ho:
 * internet aane jane ke baad "kya ye list purani to nahi?" ka jawab kheench
 * kar mil jata hai. Har phone app me yehi tareeqa hai, aur jo tareeqa sab
 * jante hain wo hi sab se aasan hota hai.
 *
 * Sirf ungli se chalta hai (maus se nahi), aur sirf tab jab screen bilkul
 * upar ho — warna aam scroll ke saath uljh jata.
 */

/**
 * Itna kheenchne par refresh chalta hai.
 *
 * Ye us ke BAAD ka faasla hai jo neeche aadha kar diya jata hai — yaani ungli
 * ko taqreeban 120px chalna parta hai. Wahi Chrome ka apna andaza hai. Is se
 * kam rakhein to aam scroll ke dauran ghalti se chal jata hai.
 */
const TRIGGER = 60

/** Is se aage nahi kheencha ja sakta — rubber band jaisa ehsaas. */
const MAX = 110

export function enablePullRefresh(onRefresh) {
  let startY = 0
  let pulling = false
  let distance = 0
  let busy = false

  const bar = document.createElement('div')
  bar.className = 'pullrefresh'
  bar.innerHTML = '<span class="pullrefresh__spin"></span>'
  document.body.appendChild(bar)

  const setPull = (px) => {
    distance = px
    bar.style.transform = `translateY(${px}px)`
    bar.classList.toggle('pullrefresh--ready', px >= TRIGGER)
  }

  const reset = () => {
    bar.classList.add('pullrefresh--snap')
    setPull(0)
    setTimeout(() => bar.classList.remove('pullrefresh--snap'), 220)
  }

  window.addEventListener(
    'touchstart',
    (e) => {
      if (busy || e.touches.length !== 1) return
      // Sirf tab jab poori screen upar ho.
      if (window.scrollY > 0) return
      startY = e.touches[0].clientY
      pulling = true
      distance = 0
    },
    { passive: true },
  )

  window.addEventListener(
    'touchmove',
    (e) => {
      if (!pulling || busy) return
      const dy = e.touches[0].clientY - startY

      // Upar ki taraf jaye to ye aam scroll hai — chhor do.
      if (dy <= 0) {
        pulling = false
        reset()
        return
      }
      // Jitna zyada kheenchein utna kam chale — rubber band.
      setPull(Math.min(MAX, dy * 0.5))
    },
    { passive: true },
  )

  window.addEventListener('touchend', async () => {
    if (!pulling || busy) return
    pulling = false

    if (distance < TRIGGER) {
      reset()
      return
    }

    busy = true
    bar.classList.add('pullrefresh--busy')
    setPull(TRIGGER)
    try {
      await onRefresh()
    } finally {
      // Thora ruk kar — foran gayab ho jaye to lagta hai kuch hua hi nahi.
      setTimeout(() => {
        bar.classList.remove('pullrefresh--busy')
        reset()
        busy = false
      }, 400)
    }
  })
}
