// Contact ou compagnie déjà dans ERPCRM (TASK-003.3, 2026-10-26) : le serveur refuse la création (409 « doublon ») quand
// une fiche semblable existe (même nom sans accents, majuscules, tirets, espaces ni 1-2 lettres de différence ; même
// courriel ; même téléphone). On montre la ou les fiches : y aller (ou l'utiliser, dans une petite fenêtre de création),
// créer quand même, ou annuler.
import api from '../services/api'
import { askChoice } from '../components/Dialog'

// Retourne { created } (nouvelle fiche), { existing } (fiche choisie, lue au complet), { go: chemin } ou null (annulé)
export async function createChecked(url, payload, { use = false } = {}) {
  try {
    return { created: (await api.post(url, payload)).data }
  } catch (e) {
    const d = e.response?.status === 409 ? e.response.data?.detail : null
    if (d?.code !== 'doublon') throw e
    const contact = d.type === 'contact'
    const lines = d.matches.map(m => `• ${m.nom}${m.compagnies ? ` — ${m.compagnies}` : ''}${m.courriel ? ` — ${m.courriel}` : ''}${m.actif ? '' : ' (inactif)'} : ${m.raison}`)
    const verb = use ? 'Utiliser' : 'Aller à'
    const one = d.matches.length === 1
    const buttons = [['cancel', 'Annuler'], ['create', 'Créer quand même'],
      ...d.matches.slice(0, 3).reverse().map(m => [m.id, one ? `${verb} ${contact ? 'ce contact' : 'cette compagnie'}`
        : `${verb} ${m.nom}${d.matches.filter(x => x.nom === m.nom).length > 1 ? ` (${m.compagnies || m.courriel || 'sans compagnie'})` : ''}`])]
    const k = await askChoice(`${contact ? 'Ce contact existe peut-être déjà dans ERPCRM' : 'Cette compagnie existe peut-être déjà dans ERPCRM'}\n${lines.join('\n')}`, buttons)
    if (k === 'cancel') return null
    if (k === 'create') return { created: (await api.post(url, { ...payload, allow_duplicate: true })).data }
    const base = contact ? '/v1/contacts' : '/v1/companies'
    if (use) return { existing: (await api.get(`${base}/${k}`)).data }
    return { go: `/${contact ? 'contacts' : 'companies'}/${k}` }
  }
}
