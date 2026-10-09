// Administration -> Journal (TASK-049, 2026-10-09) : qui a fait quoi, partout -- employes, clients du portail,
// travail automatique. Option « noter les consultations » : eteinte au depart, administrateur ou gestionnaire.
import { useEffect, useState } from 'react'
import api from '../services/api'
import JournalRows from './JournalRows'

const EMPTY = { person: '', object_type: '', action: '', date_from: '', date_to: '', q: '' }

export default function JournalPanel() {
  const [filters, setFilters] = useState(null)
  const [opt, setOpt] = useState(null)
  const [f, setF] = useState(EMPTY)
  const [rows, setRows] = useState(null)
  const [more, setMore] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.get('/v1/journal/filters').then(r => setFilters(r.data))
    api.get('/v1/journal/options').then(r => setOpt(r.data))
  }, [])
  useEffect(() => { const t = setTimeout(() => load(0), 300); return () => clearTimeout(t) }, [f])   // eslint-disable-line

  async function load(offset) {
    const params = { limit: 100, offset }
    Object.entries(f).forEach(([k, v]) => { if (v) params[k] = v })
    const r = await api.get('/v1/journal', { params })
    setRows(prev => offset ? [...prev, ...r.data.rows] : r.data.rows)
    setMore(r.data.has_more)
  }

  async function toggleViews(on) {
    setMsg('')
    try { setOpt((await api.put('/v1/journal/options', { views_enabled: on })).data) }
    catch (e) { setMsg(e.response?.data?.detail || 'Refusé') }
  }

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const box = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20, marginBottom: 16 }
  const lab = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#6B7280' }
  const inp = { fontSize: 14, padding: '7px 10px', border: '1.5px solid #D1D5DB', borderRadius: 6 }
  return (
    <div>
      <div style={box}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px', color: '#111827' }}>Journal des actions</h3>
        <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 12px' }}>
          Tout ce qui est créé, modifié ou supprimé dans ERPCRM, par qui et quand : employés, clients du portail et travail automatique.
          Les mots de passe et autres secrets ne sont jamais inscrits. Rien ne s'efface.
        </p>
        {opt && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }} title={opt.can_change ? '' : 'Seul un administrateur ou un gestionnaire peut changer cette option'}>
            <input type="checkbox" checked={opt.views_enabled} disabled={!opt.can_change} onChange={e => toggleViews(e.target.checked)} />
            Noter aussi les consultations (qui a ouvert telle fiche)
          </label>
        )}
        {msg && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 6 }}>{msg}</div>}
      </div>

      <div style={box}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={lab}>Qui
            <select value={f.person} onChange={e => set('person', e.target.value)}>
              <option value="">Tout le monde</option>
              {(filters?.people || []).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label style={lab}>Sorte de fiche
            <select value={f.object_type} onChange={e => set('object_type', e.target.value)}>
              <option value="">Toutes</option>
              {(filters?.types || []).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label style={lab}>Action
            <select value={f.action} onChange={e => set('action', e.target.value)}>
              <option value="">Toutes</option>
              {(filters?.actions || []).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <label style={lab}>Du<input type="date" value={f.date_from} onChange={e => set('date_from', e.target.value)} style={inp} /></label>
          <label style={lab}>Au<input type="date" value={f.date_to} onChange={e => set('date_to', e.target.value)} style={inp} /></label>
          <label style={{ ...lab, flex: 1, minWidth: 180 }}>Recherche
            <input value={f.q} onChange={e => set('q', e.target.value)} placeholder="valeur, champ, nom…" style={inp} />
          </label>
          {JSON.stringify(f) !== JSON.stringify(EMPTY) && <button className="btn-secondary" onClick={() => setF(EMPTY)}>Effacer les filtres</button>}
        </div>
        {rows === null ? <div style={{ padding: 20, color: '#9CA3AF' }}>Chargement…</div> : <JournalRows rows={rows} />}
        {more && <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => load(rows.length)}>Voir plus</button>}
      </div>
    </div>
  )
}
