// Privilèges de la personne connectée (TASK-007.4, 2026-10-25) : {section: 'aucun' | 'voir' | 'modifier'}, lus dans
// /auth/me. Le vrai verrou est sur le serveur ; ici, on cache seulement ce qu'elle n'a pas le droit de voir.
const RANG = { aucun: 0, voir: 1, modifier: 2 }
let current = null

export function setPrivileges(p) { current = p || null }

export function can(section, level = 'voir') {
  if (!current) return true                      // pas encore lus : le serveur refusera au besoin
  return (RANG[current[section]] || 0) >= RANG[level]
}

export const LEVELS = [['aucun', 'Aucun'], ['voir', 'Voir'], ['modifier', 'Modifier']]
