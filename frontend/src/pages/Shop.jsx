import { useState, useEffect } from 'react'
import api from '../services/api'
import './Shop.css'

const fmt = n => `${parseFloat(n || 0).toFixed(2)} $`

export default function Shop() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [cart, setCart] = useState([]) // [{item, quantity}]
  const [step, setStep] = useState('catalogue') // catalogue | cart | checkout | confirm
  const [order, setOrder] = useState(null)

  useEffect(() => {
    api.get('/v1/ecom/catalogue').then(r => setItems(r.data)).finally(() => setLoading(false))
  }, [])

  function addToCart(item) {
    setCart(p => {
      const existing = p.find(c => c.item.id === item.id)
      if (existing) return p.map(c => c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...p, { item, quantity: 1 }]
    })
  }

  function removeFromCart(itemId) { setCart(p => p.filter(c => c.item.id !== itemId)) }
  function updateQty(itemId, qty) {
    if (qty < 1) { removeFromCart(itemId); return }
    setCart(p => p.map(c => c.item.id === itemId ? { ...c, quantity: qty } : c))
  }

  const cartTotal = cart.reduce((s, c) => s + c.item.price * c.quantity, 0)
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0)

  return (
    <div className="shop-page">
      <div className="shop-topbar">
        <div className="shop-brand">Simple IP — Boutique</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {step === 'catalogue' && cartCount > 0 && (
            <button className="shop-cart-btn" onClick={() => setStep('cart')}>
              Panier ({cartCount}) — {fmt(cartTotal)}
            </button>
          )}
          {step !== 'catalogue' && step !== 'confirm' && (
            <button className="shop-back-btn" onClick={() => setStep(step === 'checkout' ? 'cart' : 'catalogue')}>
              ← Retour
            </button>
          )}
        </div>
      </div>

      <div className="shop-body">
        {step === 'catalogue' && (
          <CatalogueView items={items} loading={loading} onAdd={addToCart} cart={cart} />
        )}
        {step === 'cart' && (
          <CartView cart={cart} onUpdateQty={updateQty} onRemove={removeFromCart}
            onCheckout={() => setStep('checkout')} total={cartTotal} />
        )}
        {step === 'checkout' && (
          <CheckoutView cart={cart} total={cartTotal}
            onOrdered={o => { setOrder(o); setCart([]); setStep('confirm') }} />
        )}
        {step === 'confirm' && order && (
          <ConfirmView order={order} onNew={() => { setStep('catalogue'); setOrder(null) }} />
        )}
      </div>
    </div>
  )
}

function CatalogueView({ items, loading, onAdd, cart }) {
  const [filter, setFilter] = useState('')
  const cats = [...new Set(items.map(i => i.category).filter(Boolean))]
  const [selCat, setSelCat] = useState('')
  const visible = items.filter(i =>
    (!selCat || i.category === selCat) &&
    (!filter || i.name.toLowerCase().includes(filter.toLowerCase()))
  )
  const inCart = id => cart.find(c => c.item.id === id)

  if (loading) return <div className="loading">Chargement du catalogue...</div>

  return (
    <div>
      <div className="shop-filters">
        <input className="shop-search" placeholder="Rechercher..." value={filter} onChange={e => setFilter(e.target.value)} />
        <div className="shop-cats">
          <button className={`shop-cat${!selCat ? ' active' : ''}`} onClick={() => setSelCat('')}>Tous</button>
          {cats.map(c => <button key={c} className={`shop-cat${selCat === c ? ' active' : ''}`} onClick={() => setSelCat(c)}>{c}</button>)}
        </div>
      </div>
      <div className="shop-grid">
        {visible.map(item => {
          const qty = inCart(item.id)?.quantity || 0
          return (
            <div key={item.id} className="shop-card">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="shop-card-img" />
              ) : (
                <div className="shop-card-img-placeholder">📦</div>
              )}
              <div className="shop-card-body">
                {item.category && <div className="shop-card-cat">{item.category}</div>}
                <div className="shop-card-name">{item.name}</div>
                {item.description && <div className="shop-card-desc">{item.description}</div>}
                <div className="shop-card-footer">
                  <div className="shop-card-price">{fmt(item.price)}</div>
                  {qty === 0 ? (
                    <button className="shop-add-btn" onClick={() => onAdd(item)}>Ajouter</button>
                  ) : (
                    <span className="shop-in-cart">✓ {qty} au panier</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {visible.length === 0 && <div style={{ color: '#9CA3AF', gridColumn: '1/-1', textAlign: 'center', padding: '48px 0' }}>Aucun article trouvé.</div>}
      </div>
    </div>
  )
}

function CartView({ cart, onUpdateQty, onRemove, onCheckout, total }) {
  return (
    <div className="shop-cart">
      <h2 className="shop-section-title">Mon panier</h2>
      {cart.length === 0 ? (
        <div style={{ color: '#9CA3AF', textAlign: 'center', padding: '48px 0' }}>Panier vide.</div>
      ) : (
        <>
          <table className="shop-cart-table">
            <thead><tr><th>Article</th><th>Prix unit.</th><th>Quantité</th><th>Total</th><th></th></tr></thead>
            <tbody>
              {cart.map(c => (
                <tr key={c.item.id}>
                  <td style={{ fontWeight: 600 }}>{c.item.name}</td>
                  <td style={{ fontFamily: 'monospace' }}>{fmt(c.item.price)}</td>
                  <td>
                    <input type="number" min="1" value={c.quantity}
                      onChange={e => onUpdateQty(c.item.id, parseInt(e.target.value) || 0)}
                      style={{ width: 60, border: '1px solid #D1D5DB', borderRadius: 4, padding: '4px 8px', textAlign: 'center' }} />
                  </td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmt(c.item.price * c.quantity)}</td>
                  <td><button onClick={() => onRemove(c.item.id)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 16 }}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="shop-cart-total">Total : <strong>{fmt(total)}</strong></div>
          <button className="shop-checkout-btn" onClick={onCheckout}>Passer à la commande →</button>
        </>
      )}
    </div>
  )
}

function CheckoutView({ cart, total, onOrdered }) {
  const [form, setForm] = useState({ customer_name: '', customer_email: '', customer_phone: '', company_name: '', customer_notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    if (!form.customer_name || !form.customer_email) { setError('Nom et courriel requis'); return }
    setSaving(true)
    setError('')
    try {
      const r = await api.post('/v1/ecom/orders', {
        customer_name: form.customer_name,
        customer_email: form.customer_email,
        customer_phone: form.customer_phone || null,
        company_name: form.company_name || null,
        customer_notes: form.customer_notes || null,
        lines: cart.map(c => ({ catalogue_item_id: c.item.id, quantity: c.quantity })),
      })
      onOrdered(r.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la commande')
    } finally { setSaving(false) }
  }

  return (
    <div className="shop-checkout">
      <h2 className="shop-section-title">Coordonnées</h2>
      {error && <div className="shop-error">{error}</div>}
      <form onSubmit={submit} className="shop-checkout-form">
        <div className="form-group"><label>Nom complet *</label><input value={form.customer_name} onChange={e => f('customer_name', e.target.value)} autoFocus required /></div>
        <div className="form-group"><label>Courriel *</label><input type="email" value={form.customer_email} onChange={e => f('customer_email', e.target.value)} required /></div>
        <div className="form-group"><label>Téléphone</label><input value={form.customer_phone} onChange={e => f('customer_phone', e.target.value)} /></div>
        <div className="form-group"><label>Compagnie</label><input value={form.company_name} onChange={e => f('company_name', e.target.value)} /></div>
        <div className="form-group"><label>Notes / instructions</label><textarea value={form.customer_notes} onChange={e => f('customer_notes', e.target.value)} rows={3} /></div>
        <div className="shop-order-summary">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Résumé de commande</div>
          {cart.map(c => (
            <div key={c.item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '4px 0' }}>
              <span>{c.item.name} × {c.quantity}</span>
              <span style={{ fontFamily: 'monospace' }}>{fmt(c.item.price * c.quantity)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 8, paddingTop: 8, borderTop: '1px solid #E5E7EB' }}>
            <span>Total</span><span style={{ fontFamily: 'monospace' }}>{fmt(total)}</span>
          </div>
        </div>
        <button type="submit" className="shop-checkout-btn" disabled={saving}>{saving ? 'Envoi...' : 'Confirmer la commande'}</button>
      </form>
    </div>
  )
}

function ConfirmView({ order, onNew }) {
  return (
    <div className="shop-confirm">
      <div className="shop-confirm-icon">✓</div>
      <h2>Commande reçue !</h2>
      <p>Votre commande <strong>{order.order_number}</strong> a été soumise avec succès.</p>
      <p style={{ color: '#6B7280' }}>Vous recevrez un courriel de confirmation à <strong>{order.customer_email}</strong>. Notre équipe vous contactera sous peu.</p>
      <button className="shop-checkout-btn" onClick={onNew} style={{ marginTop: 24 }}>Retour à la boutique</button>
    </div>
  )
}
