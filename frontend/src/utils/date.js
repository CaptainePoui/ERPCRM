// Dates « du jour » et dates seules a l'heure locale (2026-10-07/08). Le navigateur lit « 2026-10-07 » comme minuit
// UTC, soit le 6 octobre a 20 h au Quebec : une date seule s'affichait la veille, et toISOString() donnait le
// lendemain des 20 h. Le serveur utilise le fuseau de l'entreprise (Parametres, backend/app/core/clock.py).

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/

// Aujourd'hui « AAAA-MM-JJ » a l'heure locale (a la place de new Date().toISOString().slice(0, 10))
export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Date seule -> minuit local ; date avec heure -> telle quelle (a la place de new Date(s))
export function parseDay(s) {
  if (s instanceof Date) return s
  if (typeof s === 'string' && DAY_ONLY.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(s)
}
