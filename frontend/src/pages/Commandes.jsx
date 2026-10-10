import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EcomOrderList } from './EcomOrders'

// Les bons de commande fournisseurs sont dans Achats > Bons de commande (2026-10-02)
const TABS = ['Web']
const TAB_SLUGS = ['web']

export default function Commandes() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = Math.max(0, TAB_SLUGS.indexOf(searchParams.get('tab')))
  const [tab, setTab] = useState(initialTab)

  // Persiste l'onglet actif dans l'URL -- sinon un refresh retombe toujours sur
  // Fournisseurs, meme si on etait sur Web.
  function selectTab(i) {
    setTab(i)
    const next = new URLSearchParams(searchParams)
    next.set('tab', TAB_SLUGS[i])
    setSearchParams(next, { replace: true })
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid var(--c-border)', padding: '0 24px' }}>
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => selectTab(i)}
            style={{
              background: 'none', border: 'none', padding: '10px 18px', cursor: 'pointer',
              fontSize: 14, fontWeight: tab === i ? 600 : 500,
              color: tab === i ? 'var(--brand)' : 'var(--c-muted)',
              borderBottom: tab === i ? '2px solid var(--brand)' : '2px solid transparent',
              marginBottom: -2, transition: 'all .15s',
            }}
          >{t}</button>
        ))}
      </div>
      {tab === 0 && <EcomOrderList />}
    </div>
  )
}
