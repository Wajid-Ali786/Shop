import { esc } from './dom.js'
import { t } from '../i18n/index.js'

/**
 * Lambi liston ko tukron me dikhana.
 *
 * Do wajahein hain. Ek: sasta phone hazaar rows ka DOM banane me kai second
 * ke liye jam jata hai. Do: har row ki tasveer bhi saath hi load hoti hai.
 * Screen par to waise bhi 8-10 rows aati hain.
 *
 * Neeche pahunchne par agla tukra KHUD aa jata hai — jaise har app me hota
 * hai. Button phir bhi rakha hai: `IntersectionObserver` ka na chalna, ya
 * bohat tez scroll, dono soorton me dukandar atak nahi jata.
 */
export const PAGE_SIZE = 16

/**
 * "Aur dikhayein" ka hissa — button aur wo khali nishan jise dekh kar agla
 * tukra apne aap aata hai.
 */
export function moreBar(shown, total) {
  const remaining = total - shown
  if (remaining <= 0) return ''

  return `
    <div class="morebar" data-more-sentinel>
      <button class="btn btn--secondary btn--full" data-show-more>
        ${esc(t('products.showMore', { count: Math.min(remaining, PAGE_SIZE) }))}
      </button>
      <p class="tiny muted center" style="margin-top:8px">
        ${esc(t('products.showingOf', { shown, total }))}
      </p>
    </div>`
}

/**
 * Pichhla tukra kis jagah par mangwaya gaya tha.
 *
 * Is ke baghair tukron ka faida hi khatam ho jata hai: har naya tukra aate hi
 * nayi sentinel banti hai, aur agar wo abhi bhi nazar me ho to observer foran
 * dobara chal parta hai — aur yehi silsila poori list aane tak chalta rehta
 * hai. (Test me 156 me se saari 156 rows ek saath aa gayi thin.) Ab agla tukra
 * tab hi aata hai jab dukandar waqai aage barha ho.
 */
let lastAutoY = -1

/** Nayi list (search/filter badla) — ginti dobara shuru. */
export function resetAutoLoad() {
  lastAutoY = -1
}

/**
 * Neeche pahunchte hi agla tukra mangwana.
 *
 * `onMore()` ko bar bar chalne se rokna zaroori hai: observer ek hi nishan par
 * kai dafa chal sakta hai jab tak screen dobara na bane. Is liye ek dafa chala
 * kar observer band kar dete hain — agli render nayi sentinel le aati hai.
 */
export function autoLoadMore(root, onMore) {
  const sentinel = root.querySelector('[data-more-sentinel]')
  if (!sentinel) return
  if (typeof IntersectionObserver !== 'function') return

  if (Math.round(window.scrollY) === lastAutoY) {
    /*
     * Isi jagah par abhi abhi tukra aaya hai. Dukandar ke aage barhne ka
     * intezar karte hain. Scroll par khud dobara koshish kar lete hain —
     * observer sirf "andar aane" par chalta hai, aur sentinel to pehle se
     * andar hai, is liye us se koi naya paighaam nahi milega.
     */
    window.addEventListener('scroll', () => autoLoadMore(root, onMore), {
      once: true,
      passive: true,
    })
    return
  }

  let fired = false
  const observer = new IntersectionObserver(
    (entries) => {
      if (fired || !entries.some((e) => e.isIntersecting)) return
      fired = true
      lastAutoY = Math.round(window.scrollY)
      observer.disconnect()
      onMore()
    },
    // Thora pehle se mangwa lete hain, taake ruk kar intezar na karna pare.
    { rootMargin: '300px 0px' },
  )
  observer.observe(sentinel)
}
