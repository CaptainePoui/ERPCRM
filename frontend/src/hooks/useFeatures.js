import { useState, useEffect } from 'react'
import api from '../services/api'

// Options activables du logiciel (Administration → Intégrations), lues une fois par page puis partagées.
// barter = Échanges (troc), éteint par défaut : décoché, toutes les options d'échange disparaissent (2026-10-08).
let cache = null
let pending = null

function load() {
  if (!pending) pending = api.get('/v1/settings').then(r => { cache = { barter: !!r.data.barter_enabled }; return cache })
    .catch(() => { pending = null; return { barter: false } })
  return pending
}

export function invalidateFeatures() { cache = null; pending = null }

export default function useFeatures() {
  const [f, setF] = useState(cache)
  useEffect(() => { if (!cache) load().then(setF) }, [])
  return f || { barter: false, loading: true }
}
