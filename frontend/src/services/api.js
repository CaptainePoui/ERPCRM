import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export function getToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token')
}

export function setToken(token, remember) {
  if (remember) {
    localStorage.setItem('token', token)
    sessionStorage.removeItem('token')
  } else {
    sessionStorage.setItem('token', token)
    localStorage.removeItem('token')
  }
}

export function clearToken() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  sessionStorage.removeItem('token')
  sessionStorage.removeItem('user')
}

api.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    // Sauf la connexion elle-même : son message (essais restants, blocage -- TASK-001.1) doit rester affiché
    if (err.response?.status === 401 && !(err.config?.url || '').endsWith('/auth/login')) {
      clearToken()
      window.location.href = '/'
    }
    // Action refusée par les privilèges (TASK-007.4) : la page Layout l'affiche en rouge (les lectures, elles, se
    // contentent de ne rien montrer)
    const detail = err.response?.data?.detail
    if (err.response?.status === 403 && (err.config?.method || 'get') !== 'get' && typeof detail === 'string') {
      window.dispatchEvent(new CustomEvent('erpcrm-refus', { detail }))
    }
    // Suppression refusée (2026-11-04, Philippe : « quand ça refuse de deleter, ça le dit ? impossible, appartient à
    // ticket xxxx ou à RDV date ou autre ») : la raison donnée par le serveur s'affiche toujours, partout
    else if ((err.config?.method || '') === 'delete' && [400, 409, 422].includes(err.response?.status) && typeof detail === 'string') {
      window.dispatchEvent(new CustomEvent('erpcrm-refus', { detail: `Suppression refusée : ${detail}` }))
    }
    return Promise.reject(err)
  }
)

export default api
