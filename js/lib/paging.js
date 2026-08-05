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

  let fired = false
  const observer = new IntersectionObserver(
    (entries) => {
      if (fired || !entries.some((e) => e.isIntersecting)) return
      fired = true
      observer.disconnect()
      onMore()
    },
    // Thora pehle se mangwa lete hain, taake ruk kar intezar na karna pare.
    { rootMargin: '300px 0px' },
  )
  observer.observe(sentinel)
}
