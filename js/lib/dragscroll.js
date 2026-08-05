/**
 * Chip walon ko pakar kar khisakna.
 *
 * Phone par ungli se scroll pehle hi chalta hai — ye us ke liye nahi hai. Ye
 * un jagahon ke liye hai jahan maus ya trackpad se aane wale ko koi raasta
 * nahi milta: category chips ka chauthai screen wala hissa scroll to hota hai
 * magar sirf pehiye se, aur bohat se log samajh hi nahi pate ke wo khisak
 * sakta hai.
 *
 * Aham baat: chips par TAP bhi kaam karta rehna chahiye. Is liye jab tak
 * ungli/maus THRESHOLD se zyada na hile, ye kuch nahi karta — aur agar hil
 * jaye to us ke baad wala click daba diya jata hai, warna khisakne ke baad
 * ungli uthate hi ghalat category chun jati.
 */

/** Itne pixel hilne se pehle ye khisakna nahi manta — tap bacha rehta hai. */
const THRESHOLD = 6

export function enableDragScroll(el) {
  if (!el || el.dataset.dragscroll === 'on') return
  el.dataset.dragscroll = 'on'

  let startX = 0
  let startY = 0
  let startLeft = 0
  let startTop = 0
  let pointerId = null
  let dragging = false

  const canScrollX = () => el.scrollWidth > el.clientWidth
  const canScrollY = () => el.scrollHeight > el.clientHeight

  el.addEventListener('pointerdown', (e) => {
    // Sirf maus ka bayan button aur pen — touch ko browser khud sambhalta hai.
    if (e.pointerType === 'touch') return
    if (e.button !== 0) return
    if (!canScrollX() && !canScrollY()) return

    pointerId = e.pointerId
    startX = e.clientX
    startY = e.clientY
    startLeft = el.scrollLeft
    startTop = el.scrollTop
    dragging = false
  })

  el.addEventListener('pointermove', (e) => {
    if (pointerId !== e.pointerId) return

    const dx = e.clientX - startX
    const dy = e.clientY - startY

    if (!dragging) {
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return
      dragging = true
      el.classList.add('dragging')
      // Pointer capture se ungli chips se bahar chali jaye to bhi chalta rehta.
      //
      // try/catch lazmi hai: pointer beech me chhoot chuka ho (maus window se
      // bahar nikal gaya, ya event khud banaya gaya ho) to browser
      // NotFoundError phenkta hai. Capture na mile to bhi khisakna chalta
      // rehta hai — bas ungli bahar jane par ruk jayega.
      try {
        el.setPointerCapture?.(e.pointerId)
      } catch {
        // Koi baat nahi.
      }
    }

    if (canScrollX()) el.scrollLeft = startLeft - dx
    if (canScrollY()) el.scrollTop = startTop - dy
    e.preventDefault()
  })

  const end = (e) => {
    if (pointerId !== e.pointerId) return
    try {
      el.releasePointerCapture?.(e.pointerId)
    } catch {
      // Capture pehle hi chhoot chuka tha.
    }
    pointerId = null
    el.classList.remove('dragging')

    // `dragging` abhi true rehne dete hain taake neeche wala click handler
    // usay dekh sake; agle tick par saaf ho jata hai.
    if (dragging) setTimeout(() => (dragging = false), 0)
  }

  el.addEventListener('pointerup', end)
  el.addEventListener('pointercancel', end)

  // Khisakne ke baad wala click nigal jate hain — warna ungli jis chip par
  // ruki wo chun li jati.
  el.addEventListener(
    'click',
    (e) => {
      if (!dragging) return
      e.stopPropagation()
      e.preventDefault()
    },
    true,
  )

  // Tasveer/text ka apna drag beech me na aaye.
  el.addEventListener('dragstart', (e) => {
    if (dragging) e.preventDefault()
  })
}

/** Ek screen ke saare chip rows ek saath. */
export function wireDragScroll(root) {
  for (const el of root.querySelectorAll('.catchips, .chips, .tagideas__row')) {
    enableDragScroll(el)
  }
}
