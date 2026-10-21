import { useEffect } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import api from '../services/api'

// Chemin de navigation (TASK-054, 2026-10-21) : Philippe — « le bouton back nous ramène où on était (mettre un système
// de mémoire à l'extérieur du browser pour y avoir accès même après un refresh) ». Chaque écran visité est retenu dans
// l'ordre ; « Retour » ramène à l'écran précédent. Gardé sur l'appareil et sur le serveur (même après un rafraîchissement,
// ou sur un autre appareil).

const KEY = 'erpcrm-nav-trail'
const MAX = 50
let trail = []
let saveTimer = null
let loaded = false

function readLocal() { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(trail)) } catch { /* sans stockage */ }
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => api.put('/v1/auth/me/nav-trail', { trail }).catch(() => {}), 1500)
}

function visit(path, replace) {
  const n = trail.length
  if (n && trail[n - 1].path === path) return                       // rafraîchissement : rien
  if (replace && n) {                                                 // redirection (ex. /invoices/x -> fiche du client) :
    trail = [...trail.slice(0, -1), { path }]                         // remplace l'étape, sinon « Retour » bouclerait
    persist()
    return
  }
  if (n >= 2 && trail[n - 2].path === path) trail = trail.slice(0, -1)   // retour (bouton ou flèche du navigateur)
  else trail = [...trail, { path }].slice(-MAX)
  persist()
}

// À monter une fois (Layout) : suit chaque changement d'écran
export function useNavTrail() {
  const location = useLocation()
  const navType = useNavigationType()
  useEffect(() => {
    if (loaded) return
    loaded = true
    trail = readLocal()
    if (!trail.length) api.get('/v1/auth/me/nav-trail').then(r => { if (!trail.length || trail.length === 1) { trail = [...(r.data.trail || []), ...trail].slice(-MAX) } }).catch(() => {})
  }, [])
  useEffect(() => { visit(location.pathname + location.search, navType === 'REPLACE') }, [location.pathname, location.search])
}

// « ← Retour » : l'écran précédent du chemin, sinon la liste par défaut
export function useBack(fallback = '/') {
  const navigate = useNavigate()
  return () => {
    const n = trail.length
    navigate(n >= 2 ? trail[n - 2].path : fallback)
  }
}
