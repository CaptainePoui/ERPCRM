import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import './Invoices.css'

const STATUS_LABELS = {
  brouillon: { label: 'Brouillon', color: '#6B7280' },
  envoye:    { label: 'Envoyé',    color: 'var(--brand)' },
  accepte:   { label: 'Accepté',   color: '#059669' },
  refuse:    { label: 'Refusé',    color: '#DC2626' },
  expire:    { label: 'Expiré',    color: '#9CA3AF' },
}

const STATUS_TRANSITIONS = {
  brouillon: ['envoye'],
  envoye:    ['accepte', 'refuse', 'expire'],
  accepte:   [],
  refuse:    [],
  expire:    [],
}

function fmt(val) {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(val)
}

function fmtOpened(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CA') + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function DevisDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [catalogue, setCatalogue] = useState([])
  const [addingLine, setAddingLine] = useState(false)
  const [editingLine, setEditingLine] = useState(null)
  const [showSendModal, setShowSendModal] = useState(false)
  const [showOpens, setShowOpens] = useState(false)
  const [opens, setOpens] = useState([])
  const [opensLoading, setOpensLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get(`/v1/devis/${id}`),
      api.get('/v1/catalogue'),
    ]).then(([r, c]) => {
      setD(r.data)
      setCatalogue(c.data.filter(i => i.is_active))
      setLoading(false)
    })
  }, [id])

  async function saveField(field, value) {
    const r = await api.put(`/v1/devis/${id}`, { [field]: value })
    setD(r.data)
  }

  async function changeStatus(s) {
    const r = await api.put(`/v1/devis/${id}`, { status: s })
    setD(r.data)
  }

  async function deleteLine(lineId) {
    const r = await api.delete(`/v1/devis/${id}/lines/${lineId}`)
    setD(r.data)
  }

  async function deleteDevis() {
    if (!confirm('Supprimer ce devis ?')) return
    await api.delete(`/v1/devis/${id}`)
    navigate('/devis')
  }

  async function toggleOpens() {
    if (showOpens) { setShowOpens(false); return }
    setShowOpens(true)
    setOpensLoading(true)
    try {
      const r = await api.get(`/v1/track/devis/${id}/opens`)
      setOpens(r.data)
    } finally {
      setOpensLoading(false)
    }
  }

  if (loading) return <div className="page"><div className="loading">Chargement...</div></div>
  if (!d) return null

  const s = STATUS_LABELS[d.status] || STATUS_LABELS.brouillon
  const transitions = STATUS_TRANSITIONS[d.status] || []
  const editable = d.status === 'brouillon'

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-secondary" onClick={() => navigate('/devis')} style={{ padding: '6px 12px' }}>← Retour</button>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>Devis {d.number}</h1>
            <p className="page-sub">{d.company_name}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="inv-badge" style={{ background: s.color, fontSize: 13, padding: '5px 12px' }}>{s.label}</span>
          {transitions.map(t => (
            <button key={t} className="btn-secondary" onClick={() => changeStatus(t)} style={{ fontSize: 12 }}>
              → {STATUS_LABELS[t]?.label}
            </button>
          ))}
          <button className="btn-secondary" onClick={() => setShowSendModal(true)} style={{ fontSize: 12 }}>📧 Envoyer</button>
          {editable && <button className="btn-danger" onClick={deleteDevis}>Supprimer</button>}
        </div>
      </div>

      <div className="inv-detail-grid">

        <div className="inv-section">
          <div className="inv-section-title">Informations</div>
          {d.invoice_id && (
            <div className="inv-info-row">
              <span>Converti en facture</span>
              <strong style={{ color: 'var(--brand)', cursor: 'pointer' }} onClick={() => navigate(`/invoices/${d.invoice_id}`)}>Voir la facture</strong>
            </div>
          )}
          <div className="inv-info-row">
            <span>Courriel ouvert</span>
            {d.last_opened_at ? (
              <span
                style={{ fontSize: 13, cursor: 'pointer' }}
                onClick={toggleOpens}
                title="Cliquer pour voir l'historique complet"
              >
                👁 {fmtOpened(d.last_opened_at)}{d.open_count > 1 ? ` (×${d.open_count})` : ''}
              </span>
            ) : <span style={{ color: '#9CA3AF', fontSize: 13 }}>Jamais</span>}
          </div>
          {showOpens && (
            <div style={{ marginTop: -8, marginBottom: 8, fontSize: 12, color: '#6B7280', background: '#F9FAFB', borderRadius: 6, padding: '8px 12px' }}>
              {opensLoading ? 'Chargement...' : opens.length === 0 ? 'Aucune ouverture enregistrée.' : (
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {opens.map((o, i) => <li key={i}>{fmtOpened(o.opened_at)}</li>)}
                </ul>
              )}
            </div>
          )}
          <div className="inv-info-row">
            <span>Date d'émission</span>
            {editable
              ? <input type="date" value={d.issue_date} onChange={e => saveField('issue_date', e.target.value)} className="inv-date-input" />
              : <strong>{new Date(d.issue_date + 'T00:00:00').toLocaleDateString('fr-CA')}</strong>}
          </div>
          <div className="inv-info-row">
            <span>Valide jusqu'au</span>
            {editable
              ? <input type="date" value={d.valid_until} onChange={e => saveField('valid_until', e.target.value)} className="inv-date-input" />
              : <strong>{new Date(d.valid_until + 'T00:00:00').toLocaleDateString('fr-CA')}</strong>}
          </div>
          <div className="inv-info-row">
            <span>Taxes</span>
            <div style={{ display: 'flex', gap: 12 }}>
              <label className="tax-check">
                <input type="checkbox" checked={d.apply_tps} disabled={!editable} onChange={e => saveField('apply_tps', e.target.checked)} />
                <span>TPS</span>
              </label>
              <label className="tax-check">
                <input type="checkbox" checked={d.apply_tvq} disabled={!editable} onChange={e => saveField('apply_tvq', e.target.checked)} />
                <span>TVQ</span>
              </label>
            </div>
          </div>
        </div>

        <div className="inv-section">
          <div className="inv-section-title">Notes</div>
          <textarea
            className="inv-notes"
            value={d.notes || ''}
            disabled={!editable}
            placeholder="Notes internes ou message client..."
            onChange={e => saveField('notes', e.target.value)}
            rows={5}
          />
        </div>
      </div>

      <div className="inv-lines-section">
        <div className="inv-section-title" style={{ marginBottom: 12 }}>
          Lignes
          {editable && <button className="btn-primary" style={{ marginLeft: 12, padding: '5px 12px', fontSize: 12 }} onClick={() => setAddingLine(true)}>+ Ajouter</button>}
        </div>

        <table className="inv-lines-table">
          <thead>
            <tr>
              <th>Description</th>
              <th style={{ textAlign: 'right', width: 80 }}>Qté</th>
              <th style={{ textAlign: 'right', width: 120 }}>Prix unit.</th>
              <th style={{ textAlign: 'right', width: 120 }}>Total</th>
              {editable && <th style={{ width: 60 }}></th>}
            </tr>
          </thead>
          <tbody>
            {d.lines.map(line => (
              <tr key={line.id} className={editable ? 'inv-line-row' : ''}>
                {editingLine === line.id
                  ? <EditLineRow line={line} onSave={async (data) => {
                      const r = await api.put(`/v1/devis/${id}/lines/${line.id}`, data)
                      setD(r.data)
                      setEditingLine(null)
                    }} onCancel={() => setEditingLine(null)} />
                  : <>
                      <td onClick={() => editable && setEditingLine(line.id)}>{line.description}</td>
                      <td style={{ textAlign: 'right' }} onClick={() => editable && setEditingLine(line.id)}>{line.qty}</td>
                      <td style={{ textAlign: 'right' }} onClick={() => editable && setEditingLine(line.id)}>{fmt(line.unit_price)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(line.line_total)}</td>
                      {editable && <td style={{ textAlign: 'center' }}><button className="inv-del-btn" onClick={() => deleteLine(line.id)}>✕</button></td>}
                    </>
                }
              </tr>
            ))}
            {d.lines.length === 0 && (
              <tr><td colSpan={editable ? 5 : 4} style={{ textAlign: 'center', color: '#9CA3AF', padding: 16 }}>Aucune ligne</td></tr>
            )}
          </tbody>
        </table>

        <div className="inv-totals">
          <div className="inv-total-row"><span>Sous-total</span><span>{fmt(d.subtotal)}</span></div>
          {d.apply_tps && <div className="inv-total-row"><span>TPS ({d.tps_rate}%)</span><span>{fmt(d.tps_amount)}</span></div>}
          {d.apply_tvq && <div className="inv-total-row"><span>TVQ ({d.tvq_rate}%)</span><span>{fmt(d.tvq_amount)}</span></div>}
          <div className="inv-total-row inv-grand-total"><span>Total</span><span>{fmt(d.total)}</span></div>
        </div>
      </div>

      {addingLine && (
        <AddLineModal
          catalogue={catalogue}
          onClose={() => setAddingLine(false)}
          onSave={async (data) => {
            const r = await api.post(`/v1/devis/${id}/lines`, data)
            setD(r.data); setAddingLine(false)
          }}
        />
      )}

      {showSendModal && (
        <SendDevisModal
          devisId={d.id}
          companyId={d.company_id}
          onClose={() => setShowSendModal(false)}
          onSent={data => { setD(data); setShowSendModal(false) }}
        />
      )}
    </div>
  )
}

function SendDevisModal({ devisId, companyId, onClose, onSent }) {
  const [email, setEmail] = useState('')
  const [loadingEmail, setLoadingEmail] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/v1/companies/${companyId}`).then(r => {
      const contacts = r.data.contacts || []
      const primary = contacts.find(c => c.is_primary && c.email) || contacts.find(c => c.email)
      if (primary) setEmail(primary.email)
    }).finally(() => setLoadingEmail(false))
  }, [companyId])

  async function send() {
    if (!email.trim()) return
    setSending(true)
    setError('')
    try {
      const r = await api.post(`/v1/devis/${devisId}/send`, { to_email: email.trim() })
      onSent(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur envoi courriel')
      setSending(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Envoyer le devis</h3>
        {error && <div style={{ color: '#DC2626', marginBottom: 12, fontSize: 13 }}>{error}</div>}
        <div className="form-group">
          <label>Courriel du destinataire</label>
          <input
            type="email"
            autoFocus
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={loadingEmail ? 'Chargement...' : 'courriel@exemple.com'}
          />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={send} disabled={sending || !email.trim()}>{sending ? '...' : 'Envoyer'}</button>
        </div>
      </div>
    </div>
  )
}

function EditLineRow({ line, onSave, onCancel }) {
  const [desc, setDesc] = useState(line.description)
  const [qty, setQty] = useState(line.qty)
  const [price, setPrice] = useState(line.unit_price)

  return (
    <>
      <td><input value={desc} onChange={e => setDesc(e.target.value)} className="inv-inline-input" autoFocus /></td>
      <td><input type="number" value={qty} onChange={e => setQty(parseFloat(e.target.value) || 0)} className="inv-inline-input" style={{ textAlign: 'right' }} /></td>
      <td><input type="number" step="0.01" value={price} onChange={e => setPrice(parseFloat(e.target.value) || 0)} className="inv-inline-input" style={{ textAlign: 'right' }} /></td>
      <td style={{ textAlign: 'right', fontWeight: 600 }}>{new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(qty * price)}</td>
      <td style={{ display: 'flex', gap: 4 }}>
        <button className="ifield-save" onClick={() => onSave({ description: desc, qty, unit_price: price })}>✓</button>
        <button className="ifield-cancel" onClick={onCancel}>✕</button>
      </td>
    </>
  )
}

function AddLineModal({ catalogue, onClose, onSave }) {
  const [mode, setMode] = useState('catalogue')
  const [selectedItem, setSelectedItem] = useState(null)
  const [form, setForm] = useState({ description: '', qty: 1, unit_price: 0 })
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  function pickItem(item) {
    setSelectedItem(item)
    setForm({ description: item.name, qty: 1, unit_price: item.price })
  }

  async function save() {
    if (!form.description.trim()) return
    setSaving(true)
    try {
      await onSave({
        catalogue_item_id: selectedItem?.id || null,
        description: form.description,
        qty: form.qty,
        unit_price: form.unit_price,
      })
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-wide" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Ajouter une ligne</h3>
        <div className="inv-mode-tabs">
          <button className={`inv-mode-tab${mode === 'catalogue' ? ' active' : ''}`} onClick={() => setMode('catalogue')}>Catalogue</button>
          <button className={`inv-mode-tab${mode === 'custom' ? ' active' : ''}`} onClick={() => setMode('custom')}>Personnalisé</button>
        </div>

        {mode === 'catalogue' && (
          <div className="inv-cat-list">
            {catalogue.map(item => (
              <div
                key={item.id}
                className={`inv-cat-item${selectedItem?.id === item.id ? ' selected' : ''}`}
                onClick={() => pickItem(item)}
              >
                <span className="inv-cat-name">{item.name}</span>
                <span className={`cat-type ${item.type}`}>{item.type === 'service' ? 'Service' : 'Matériel'}</span>
                <span className="inv-cat-price">{new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(item.price)}</span>
              </div>
            ))}
          </div>
        )}

        {(mode === 'custom' || selectedItem) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Description</label>
              <input value={form.description} onChange={e => f('description', e.target.value)} autoFocus={mode === 'custom'} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>Quantité</label>
                <input type="number" step="0.01" value={form.qty} onChange={e => f('qty', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>Prix unitaire</label>
                <input type="number" step="0.01" value={form.unit_price} onChange={e => f('unit_price', parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            <div style={{ textAlign: 'right', fontWeight: 600, color: '#111827' }}>
              Total : {new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(form.qty * form.unit_price)}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !form.description.trim()}>{saving ? '...' : 'Ajouter'}</button>
        </div>
      </div>
    </div>
  )
}
