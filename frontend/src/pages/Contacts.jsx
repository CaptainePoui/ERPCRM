import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import './Companies.css'

export default function Contacts() {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/v1/contacts').then(r => setContacts(r.data)).finally(() => setLoading(false))
  }, [])

  const filtered = contacts.filter(c => {
    const full = `${c.first_name} ${c.last_name}`.toLowerCase()
    return full.includes(search.toLowerCase()) || (c.primary_email || '').includes(search.toLowerCase())
  })

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-sub">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/contacts/new')}>+ Nouveau contact</button>
      </div>

      <div className="page-toolbar">
        <input className="search-input" placeholder="Rechercher par nom ou courriel..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <div className="loading">Chargement...</div> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Courriel</th>
                <th>Téléphone</th>
                <th>Compagnies</th>
                <th>Statuts</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="empty-row">Aucun contact trouvé</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="clickable-row" onClick={() => navigate(`/contacts/${c.id}`)}>
                  <td><span className="company-name">{c.first_name} {c.last_name}</span></td>
                  <td>{c.email || '—'}</td>
                  <td>{c.phone || c.mobile || '—'}</td>
                  <td>
                    {c.companies.map(co => (
                      <div key={co.company_id} className="company-legal">{co.company_name}</div>
                    ))}
                    {c.companies.length === 0 && <span style={{color:'#9CA3AF'}}>—</span>}
                  </td>
                  <td>
                    <div className="status-chips">
                      {c.statuses.map(s => (
                        <span key={s.id} className="status-chip" style={{ background: s.color, color: '#fff', borderColor: s.color }}>{s.name}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
