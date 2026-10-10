import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import Autocomplete from '../../components/Autocomplete'
import { C, EMPTY, fmtMoney, th, thR, td, tdR, headRow, rowStyle, Card, Modal, Field, CategorySelect, Filters, useRefs, errText } from './common'

const EMPTY_FORM = { name: '', email: '', phone: '', address: '', notes: '', company_id: null, default_category_id: null, is_active: true }

export default function Vendors() {
  const navigate = useNavigate()
  const { vendors, categories, reload } = useRefs()
  const [companies, setCompanies] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('active')
  const [edit, setEdit] = useState(null)   // null | {..form, id?}
  const [error, setError] = useState('')
  useEffect(() => { api.get('/v1/companies').then(r => setCompanies(r.data)) }, [])

  const q = search.trim().toLowerCase()
  const shown = vendors
    .filter(v => filter === 'all' || (filter === 'active' ? v.is_active : filter === 'due' ? v.balance_due > 0 : !v.is_active))
    .filter(v => !q || [v.name, v.email, v.phone].some(x => (x || '').toLowerCase().includes(q)))
  const due = shown.reduce((s, v) => s + v.balance_due, 0)
  const companyName = id => companies.find(c => c.id === id)?.name

  async function save() {
    setError('')
    try {
      const body = { ...edit }
      delete body.id
      if (edit.id) await api.put(`/v1/purchases/vendors/${edit.id}`, body)
      else await api.post('/v1/purchases/vendors', body)
      setEdit(null)
      reload()
    } catch (e) { setError(errText(e)) }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Fournisseurs</h1><p className="page-sub">{shown.length} fournisseur{shown.length > 1 ? 's' : ''} · {fmtMoney(due)} à payer</p></div>
        <button className="btn-primary" onClick={() => { setError(''); setEdit({ ...EMPTY_FORM }) }}>+ Nouveau fournisseur</button>
      </div>
      <div className="page-toolbar" style={{ gap: 10 }}>
        <input className="search-input" placeholder="Rechercher (nom, courriel, téléphone)..." value={search} onChange={e => setSearch(e.target.value)} />
        <Filters value={filter} onChange={setFilter} options={[['active', 'Actifs'], ['due', 'À payer'], ['inactive', 'Inactifs'], ['all', 'Tous']]} />
      </div>
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={headRow}>
              <th style={th}>Nom</th><th style={th}>Compagnie de la CRM</th><th style={th}>Courriel</th><th style={th}>Téléphone</th>
              <th style={thR}>Factures</th><th style={thR}>À payer</th>
            </tr></thead>
            <tbody>
              {shown.map(v => (
                <tr key={v.id} style={rowStyle} onClick={() => { setError(''); setEdit({ ...EMPTY_FORM, ...v }) }}>
                  <td style={{ ...td, fontWeight: 600, color: v.is_active ? undefined : C.faint }}>{v.name}{!v.is_active && ' (inactif)'}</td>
                  <td style={td}>{v.company_id ? <span style={{ color: C.link }} onClick={e => { e.stopPropagation(); navigate(`/companies/${v.company_id}`) }}>{companyName(v.company_id) || 'Voir'}</span> : EMPTY}</td>
                  <td style={td}>{v.email || EMPTY}</td>
                  <td style={td}>{v.phone || EMPTY}</td>
                  <td style={tdR}>{v.bill_count ? <span style={{ color: C.link }} onClick={e => { e.stopPropagation(); navigate(`/purchases/bills?vendor=${v.id}`) }}>{v.bill_count}</span> : 0}</td>
                  <td style={{ ...tdR, fontWeight: 600, color: v.balance_due > 0 ? 'var(--c-text)' : C.faint }}>{fmtMoney(v.balance_due)}</td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: C.faint, padding: 24 }}>Aucun fournisseur.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {edit && (
        <Modal title={edit.id ? `Fournisseur — ${edit.name}` : 'Nouveau fournisseur'} width={560} actions={<>
          <button className="btn-secondary" onClick={() => setEdit(null)}>Annuler</button>
          <button className="btn-primary" onClick={save}>Enregistrer</button>
        </>}>
          <Field label="Nom *"><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} autoFocus /></Field>
          <div className="form-grid">
            <Field label="Courriel"><input value={edit.email || ''} onChange={e => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Téléphone"><input value={edit.phone || ''} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></Field>
          </div>
          <Field label="Adresse"><textarea rows={2} value={edit.address || ''} onChange={e => setEdit({ ...edit, address: e.target.value })} /></Field>
          <Autocomplete label="Compagnie de la CRM (si c'est aussi un client ou partenaire)" openOnFocus
            items={companies.map(c => ({ id: c.id, label: c.name }))}
            value={edit.company_id ? { id: edit.company_id, label: companyName(edit.company_id) || '' } : null}
            onSelect={i => setEdit({ ...edit, company_id: i ? i.id : null })} />
          <Field label="Catégorie de dépense par défaut"><CategorySelect categories={categories} value={edit.default_category_id} onChange={v => setEdit({ ...edit, default_category_id: v })} /></Field>
          <Field label="Notes"><textarea rows={2} value={edit.notes || ''} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></Field>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <input type="checkbox" checked={edit.is_active} onChange={e => setEdit({ ...edit, is_active: e.target.checked })} /> Actif
          </label>
          {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
        </Modal>
      )}
    </div>
  )
}
