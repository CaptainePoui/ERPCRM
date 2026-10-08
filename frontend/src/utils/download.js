import api from '../services/api'

// Telecharge un fichier de l'API (avec le jeton) sous le nom donne -- PDF de facture, avoir, devis, echange (TASK-005.17)
export async function downloadFile(url, filename) {
  const r = await api.get(url, { responseType: 'blob' })
  const href = URL.createObjectURL(r.data)
  const a = document.createElement('a')
  a.href = href; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}
