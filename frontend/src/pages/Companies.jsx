import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { contrastText } from '../utils/color'
import './Companies.css'

export default function Companies() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [pastille, setPastille] = useState('')
  const [statuses, setStatuses] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/v1/companies').then(r => setCompanies(r.data)).finally(() => setLoading(false))
    api.get('/v1/ref/statuses').then(r => setStatuses(r.data))
  }, [])

  const filtered = companies.filter(c =>
    (c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.city || '').toLowerCase().includes(search.toLowerCase())) &&
    (!pastille || c.statuses.some(s => s.id === pastille))
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Compagnies</h1>
          <p className="page-sub">{companies.length} compagnie{companies.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/companies/new')}>
          + Nouvelle compagnie
        </button>
      </div>

      <div className="page-toolbar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          className="search-input"
          placeholder="Rechercher par nom ou ville..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select value={pastille} onChange={e => setPastille(e.target.value)} title="Filtrer par pastille"
          style={{ padding: '8px 10px', border: '1.5px solid #D1D5DB', borderRadius: 8, fontSize: 14, background: '#fff' }}>
          <option value="">Toutes les pastilles</option>
          {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="loading">Chargement...</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Compagnie</th>
                <th>Pastilles</th>
                <th>Ville</th>
                <th>Gestionnaire</th>
                <th>Compte</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="empty-row">Aucune compagnie trouvée</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="clickable-row" onClick={() => navigate(`/companies/${c.id}`)}>
                  <td>
                    <div className="company-name">{c.name}</div>
                    {c.legal_name && c.legal_name !== c.name && (
                      <div className="company-legal">{c.legal_name}</div>
                    )}
                  </td>
                  <td>
                    <div className="status-chips">
                      {c.statuses.map(s => (
                        <span key={s.id} className="status-chip" style={{ background: s.color, color: contrastText(s.color), borderColor: s.color }}>
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{c.city || '—'}</td>
                  <td>{c.internal_manager?.full_name || '—'}</td>
                  <td><span className="account-tag">{c.account_number || '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
