// Grille des privilèges (TASK-007.4, 2026-10-25) : une ligne par section d'ERPCRM, Aucun / Voir / Modifier.
// Profil (Administration › Privilèges) : value = niveaux du profil. Employé (Employés › Privilèges) : base = niveaux de
// son profil, value = ses exceptions ; « Profil » = suivre son profil.
import { LEVELS } from '../utils/privileges'

const LABEL = Object.fromEntries(LEVELS)

function Seg({ options, value, onChange, disabled }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--c-border)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
      {options.map(([v, l]) => {
        const on = v === value
        return (
          <button key={v} type="button" disabled={disabled} onClick={() => onChange(v)}
            style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', border: 'none', whiteSpace: 'nowrap',
                     borderLeft: '1px solid var(--c-border)', cursor: disabled ? 'default' : 'pointer',
                     background: on ? 'var(--brand)' : 'var(--c-surface)', color: on ? '#fff' : 'var(--c-text)' }}>{l}</button>
        )
      })}
    </div>
  )
}

export default function PrivilegeGrid({ sections, value, onChange, base, disabled }) {
  const employee = base !== undefined
  const options = employee ? [['', 'Profil'], ...LEVELS] : LEVELS
  return (
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 8 }}>
      {sections.map((s, i) => {
        const own = employee ? (value[s.key] || '') : (value[s.key] || 'aucun')
        const eff = employee ? (own || base[s.key] || 'aucun') : own
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', flexWrap: 'wrap',
                                    borderTop: i ? '1px solid var(--c-border)' : 'none' }}>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{s.label}</div>
              <div style={{ color: 'var(--c-muted)', fontSize: 12 }}>{s.help}</div>
            </div>
            {employee && <div style={{ fontSize: 12, color: 'var(--c-muted)', minWidth: 120 }}>
              Profil : {LABEL[base[s.key] || 'aucun']}{own && <> → <strong style={{ color: 'var(--c-text)' }}>{LABEL[eff]}</strong></>}
            </div>}
            <Seg options={options} value={own} disabled={disabled} onChange={v => onChange({ ...value, [s.key]: v })} />
          </div>
        )
      })}
    </div>
  )
}
