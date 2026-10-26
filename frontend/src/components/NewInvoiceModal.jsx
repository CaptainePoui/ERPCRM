import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import Autocomplete from './Autocomplete'
import QuickNewCompany from './QuickNewCompany'

export default function NewInvoiceModal({ onClose, prefillCompany = null }) {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(prefillCompany)
  const [quickCompany, setQuickCompany] = useState(null)
  const [form, setForm] = useState({ is_recurring: false, recurrence_frequency: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { api.get('/v1/companies').then(r => setCompanies(r.data)) }, [])

  const companyItems = companies.map(c => ({ id: c.id, label: c.name }))

  function afterCompanyCreated(company) {
    setCompanies(prev => [...prev, company])
    setQuickCompany(null)
    setSelectedCompany({ id: company.id, label: company.name })
  }

  async function save() {
    if (!selectedCompany) return
    setSaving(true)
    try {
      const r = await api.post('/v1/invoices', {
        company_id: selectedCompany.id,
        is_recurring: form.is_recurring,
        recurrence_frequency: form.is_recurring ? form.recurrence_frequency : null,
      })
      navigate(`/invoices/${r.data.id}`)
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="modal-overlay">
        <div className="modal-box" onClick={e => e.stopPropagation()}>
          <h3 className="modal-title">Nouvelle facture</h3>
          <Autocomplete
            label="Compagnie" required
            items={companyItems}
            value={selectedCompany}
            onSelect={setSelectedCompany}
            onCreate={name => setQuickCompany(name)}
            placeholder="Rechercher une compagnie..."
            autoFocus={!prefillCompany}
          />
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            <label className="tax-check">
              <input type="checkbox" checked={form.is_recurring} onChange={e => setForm(p => ({ ...p, is_recurring: e.target.checked }))} />
              <span>Récurrente</span>
            </label>
          </div>
          {form.is_recurring && (
            <div className="form-group">
              <label>Fréquence</label>
              <select value={form.recurrence_frequency} onChange={e => setForm(p => ({ ...p, recurrence_frequency: e.target.value }))}>
                <option value="">-- Choisir --</option>
                <option value="mensuel">Mensuelle</option>
                <option value="trimestriel">Trimestrielle</option>
                <option value="annuel">Annuelle</option>
              </select>
            </div>
          )}
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Annuler</button>
            <button className="btn-primary" onClick={save} disabled={saving || !selectedCompany}>{saving ? '...' : 'Créer'}</button>
          </div>
        </div>
      </div>
      {quickCompany && (
        <QuickNewCompany initialName={quickCompany} onCreated={afterCompanyCreated} onClose={() => setQuickCompany(null)} />
      )}
    </>
  )
}
