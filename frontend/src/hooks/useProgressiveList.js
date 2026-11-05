import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'

// Listes en deux temps (TASK-057, Philippe 2026-11-05 : « on en loade 40 avec la page et le reste après la page
// ouverte… j'accepte 1 seconde mais pas plus ») : 40 lignes demandées au serveur (?limit=40) pour ouvrir la page
// tout de suite, puis le reste (?offset=40) en arrière-plan. La recherche et les filtres portent sur toutes les
// lignes une fois arrivées. reload() (après une modification) relit tout d'un coup, sans revenir à 40 lignes.
export const FIRST = 40

export default function useProgressiveList(url, params) {
  const key = JSON.stringify([url, params || {}])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [complete, setComplete] = useState(false)
  const run = useRef(0)

  const load = useCallback(async whole => {
    const id = ++run.current
    const [u, p] = JSON.parse(key)
    try {
      if (whole) {
        const all = (await api.get(u, { params: p })).data
        if (id === run.current) { setRows(all); setComplete(true) }
        return
      }
      setLoading(true); setComplete(false)
      const first = (await api.get(u, { params: { ...p, limit: FIRST } })).data
      if (id !== run.current) return
      setRows(first); setLoading(false)
      if (first.length < FIRST) { setComplete(true); return }
      const rest = (await api.get(u, { params: { ...p, offset: FIRST } })).data
      if (id !== run.current) return
      setRows(first.concat(rest)); setComplete(true)
    } catch {
      if (id === run.current) { setLoading(false); setComplete(true) }
    }
  }, [key])

  useEffect(() => { load(false) }, [load])
  const reload = useCallback(() => load(true), [load])
  return { rows, setRows, loading, complete, reload }
}

// Affichage au défilement : seulement les `step` premières lignes sont dessinées, les suivantes quand le bas de la
// liste devient visible (dessiner 2 500 lignes d'un coup figeait la page ~3,5 s). `resetKey` : recherche ou filtre
// changé -> on revient en haut de liste.
export function useReveal(list, step = 100, resetKey = '') {
  const [count, setCount] = useState(step)
  const ref = useRef(null)
  useEffect(() => { setCount(step) }, [resetKey, step])
  const more = list.length > count
  useEffect(() => {
    if (!more || !ref.current) return
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting) setCount(c => c + step) }, { rootMargin: '600px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [more, count, step])
  return { shown: more ? list.slice(0, count) : list, more, sentinelRef: ref }
}
