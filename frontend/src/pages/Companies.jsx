import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import './Companies.css'

export default function Companies() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/v1/companies').then(r => setCompanies(r.data)).finally(() => setLoading(false))
  }, [])

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.city || '').toLowerCase().includes(search.toLowerCase())
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

      <div className="page-toolbar">
        <input
          className="search-input"
          placeholder="Rechercher par nom ou ville..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Chargement...</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Compagnie</th>
                <th>Statuts</th>
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
                        <span key={s.id} className="status-chip" style={{ background: s.color, color: '#fff', borderColor: s.color }}>
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
