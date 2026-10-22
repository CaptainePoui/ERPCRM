import { useState, useEffect } from 'react'
import api from '../services/api'
import Autocomplete from './Autocomplete'
import { askConfirm } from './Dialog'

// Regles « beneficiaire -> client / fournisseur » de la banque : dans Banque (Regles de transaction) et dans
// Administration › Zeko (2026-10-22). Zeko les lit et les change aussi dans le chat, apres un « oui ».
const C = { border: 'var(--c-border)', muted: 'var(--c-muted)', faint: 'var(--c-faint)', link: 'var(--brand)', red: '#DC2626' }
const linkBtn = color => ({ background: 'none', border: 'none', color, cursor: 'pointer', fontSize: 12, padding: 0, whiteSpace: 'nowrap' })

export default function BankRulesPanel() {
  const [rules, setRules] = useState(null)
  const [companies, setCompanies] = useState([])
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState(null)
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 640px)').matches)
  useEffect(() => {
    const m = window.matchMedia('(max-width: 640px)'); const f = e => setPhone(e.matches)
    m.addEventListener('change', f); return () => m.removeEventListener('change', f)
  }, [])
  async function load() { setRules((await api.get('/v1/bank/rules')).data) }
  useEffect(() => {
    load()
    api.get('/v1/companies').then(r => setCompanies(r.data.map(c => ({ id: c.id, label: c.name }))))
  }, [])
  async function act(fn) {
    setError(null)
    try { await fn(); setEditing(null); await load() } catch (e) { setError(e.response?.data?.detail || 'Erreur') }
  }
  const change = (rule, company) => company && act(() => api.put(`/v1/bank/rules/${rule.id}`, { company_id: company.id }))
  async function forgetClient(rule) {
    if (!await askConfirm(`« ${rule.payee} » ne sera plus reconnu comme ${rule.company_name}. Le fournisseur ${rule.vendor_name} reste pour les retraits ; les associations déjà faites restent.`)) return
    act(() => api.post(`/v1/bank/rules/${rule.id}/forget-client`))
  }
  async function remove(rule) {
    if (!await askConfirm(`Supprimer la règle « ${rule.payee} → ${rule.company_name || rule.vendor_name} » ? Les lignes non classées qu'elle reconnaissait ne seront plus attribuées (les associations déjà faites restent).`)) return
    act(() => api.delete(`/v1/bank/rules/${rule.id}`))
  }
  const who = r => editing === r.id
    ? <Autocomplete items={companies} value={{ id: r.company_id, label: r.company_name }} onSelect={c => change(r, c)} openOnFocus autoFocus />
    : <>{r.company_name || ''}{r.vendor_name && <div style={{ fontSize: 12, color: C.muted }}>{r.company_name ? 'Fournisseur : ' : ''}{r.vendor_name}{!r.company_name && ' (fournisseur)'}</div>}</>
  const actions = (r, justify = 'flex-start') => (
    <div style={{ display: 'flex', gap: 14, justifyContent: justify, flexWrap: 'wrap' }}>
      <button type="button" onClick={() => setEditing(editing === r.id ? null : r.id)} style={linkBtn(C.link)}>{editing === r.id ? 'Fermer' : r.company_name ? 'Changer le client' : 'Ajouter un client'}</button>
      {r.company_name && r.vendor_name && <button type="button" onClick={() => forgetClient(r)} style={linkBtn(C.red)}>Retirer le client</button>}
      <button type="button" onClick={() => remove(r)} style={linkBtn(C.red)}>Supprimer</button>
    </div>
  )
  return (
    <div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>
        Une règle reconnaît automatiquement un bénéficiaire du relevé : le client de ses dépôts (onglet « Reconnu ») et le fournisseur de ses retraits.
        Pour en créer une : cliquez sur le nom d'un bénéficiaire dans les transactions non classées, ou demandez-le à Zéko.
      </div>
      {phone ? (
        <div>
          {rules === null && <div style={{ color: C.faint, padding: 16 }}>Chargement...</div>}
          {rules?.length === 0 && <div style={{ color: C.faint, padding: 16 }}>Aucune règle pour l'instant.</div>}
          {rules?.map(r => (
            <div key={r.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 8, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b style={{ overflowWrap: 'anywhere' }}>{r.payee}</b><span style={{ color: C.muted, fontSize: 12, whiteSpace: 'nowrap' }}>{r.transactions} lignes</span>
              </div>
              <div style={{ margin: '4px 0 8px' }}>{who(r)}</div>
              {actions(r)}
            </div>
          ))}
        </div>
      ) : (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: C.muted, fontSize: 11, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>
              <th style={{ padding: 8 }}>Bénéficiaire du relevé</th>
              <th style={{ padding: 8 }}>Client (dépôts) / Fournisseur (retraits)</th>
              <th style={{ padding: 8, textAlign: 'right' }}>Lignes</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {rules === null && <tr><td colSpan={4} style={{ padding: 16, color: C.faint, textAlign: 'center' }}>Chargement...</td></tr>}
            {rules?.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: C.faint, padding: 24 }}>Aucune règle pour l'instant.</td></tr>}
            {rules?.map(r => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: 8 }}>{r.payee}</td>
                <td style={{ padding: 8, minWidth: 200 }}>{who(r)}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{r.transactions}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{actions(r, 'flex-end')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{error}</div>}
    </div>
  )
}
