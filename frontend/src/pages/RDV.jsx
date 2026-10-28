// Prise de RDV en ligne, page publique (TASK-026 ; refaite TASK-026.11 et TASK-026.13, 2026-10-27) -- facon
// Calendly / Cal.com : resume a gauche, une etape a la fois a droite. Ordre voulu par Philippe : technicien (avec le
// bouton Urgence en dessous), date et une ou plusieurs plages de 30 min qui se suivent (les techniciens libres pour
// toute la plage sous le calendrier), puis une seule page : type (appel, assistance a distance, rendez-vous sur
// place), breve description, coordonnees (deja remplies si le client est connecte a son portail). Aucune icone.
// Le client voit seulement des heures libres, jamais les RDV (calculees cote serveur avec la marge du technicien).
// Techniciens « jamais disponibles » (onglet Agenda) : « aucune disponibilite avant le ... ».
// Client deja connu (son courriel) : relie a sa fiche.
// TASK-026.12 : logo de l'entreprise en grand dans un bandeau en haut, resume en bleu fonce.
import { useState, useEffect, useMemo } from 'react'
import api from '../services/api'
import './RDV.css'

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function fmtDuration(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${String(m).padStart(2, '0')}`
}

const fmtTime = t => { const [h, m] = t.split(':'); return `${parseInt(h, 10)} h ${m}` }
function fmtLongDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const s = d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

function MonthCalendar({ days, selected, onSelect }) {
  const free = useMemo(() => new Set(days.map(d => d.date)), [days])
  const first = days[0]?.date ? new Date(days[0].date + 'T12:00:00') : new Date()
  const last = days.length ? new Date(days[days.length - 1].date + 'T12:00:00') : first
  const [ym, setYm] = useState({ y: first.getFullYear(), m: first.getMonth() })
  const canPrev = ym.y > first.getFullYear() || (ym.y === first.getFullYear() && ym.m > first.getMonth())
  const canNext = ym.y < last.getFullYear() || (ym.y === last.getFullYear() && ym.m < last.getMonth())
  const move = n => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const lead = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7
  const count = new Date(ym.y, ym.m + 1, 0).getDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)]
  return (
    <div className="rdv-cal">
      <div className="rdv-cal-head">
        <button className="rdv-cal-nav" onClick={() => move(-1)} disabled={!canPrev} aria-label="Mois précédent">‹</button>
        <div className="rdv-cal-month">{MONTHS[ym.m]} {ym.y}</div>
        <button className="rdv-cal-nav" onClick={() => move(1)} disabled={!canNext} aria-label="Mois suivant">›</button>
      </div>
      <div className="rdv-cal-grid">
        {WEEK.map((w, i) => <div key={i} className="rdv-cal-dow">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const key = iso(ym.y, ym.m, d)
          const ok = free.has(key)
          return (
            <button key={i} className={`rdv-cal-day${ok ? ' free' : ''}${selected === key ? ' selected' : ''}`}
              disabled={!ok} onClick={() => onSelect(key)}>{d}</button>
          )
        })}
      </div>
    </div>
  )
}

const TYPES = [
  ['appel', 'Appel téléphonique', "Un technicien vous appelle à l'heure choisie."],
  ['distance', 'Assistance à distance', 'Un technicien prend le contrôle de votre ordinateur, avec votre accord.'],
  ['rdv', 'Rendez-vous sur place', 'Un technicien se déplace chez vous.'],
]
const EMPTY_FORM = { first_name: '', last_name: '', email: '', phone: '', mobile: '', company_name: '', address: '', description: '' }
const addMin = (t, n) => { const [h, m] = t.split(':').map(Number); const x = h * 60 + m + n; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}` }

function UrgenceModal({ onYes, onNo }) {
  // se ferme seulement par Oui ou Non, jamais par un clic a cote
  return (
    <div className="rdv-modal-overlay">
      <div className="rdv-modal" role="dialog" aria-modal="true" aria-labelledby="rdv-urgence-title">
        <h2 id="rdv-urgence-title" className="rdv-modal-title">Attention</h2>
        <p>Une urgence pour un problème dont Simple IP n'est pas responsable est facturée <b>300 $ de l'heure, 2 heures minimum</b>.</p>
        <p>Voulez-vous continuer ?</p>
        <div className="rdv-modal-actions">
          <button className="rdv-secondary" onClick={onNo}>Non</button>
          <button className="rdv-urgent-yes" onClick={onYes}>Oui, c'est une urgence</button>
        </div>
      </div>
    </div>
  )
}

export default function RDV() {
  const [step, setStep] = useState('tech') // tech | slot | details | confirm
  const [config, setConfig] = useState(null)
  const [techs, setTechs] = useState(null)
  const [tech, setTech] = useState(null)       // { id, name, initials, next_date } | { id: 'any' }
  const [urgent, setUrgent] = useState(false)
  const [askUrgent, setAskUrgent] = useState(false)
  const [availability, setAvailability] = useState([])
  const [loadingAvail, setLoadingAvail] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selected, setSelected] = useState([])  // plages de 30 min qui se suivent ("HH:MM")
  const [rangeTechs, setRangeTechs] = useState(null)
  const [rangeTech, setRangeTech] = useState(null)
  const [type, setType] = useState(null)       // appel | distance | rdv
  const [prefill, setPrefill] = useState(EMPTY_FORM)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [booking, setBooking] = useState(null)

  useEffect(() => {
    api.get('/v1/rdv/config').then(r => setConfig(r.data))
    api.get('/v1/rdv/techs').then(r => setTechs(r.data)).catch(() => setTechs([]))
    // client connecte a son portail : coordonnees deja remplies
    let token = null
    try { token = localStorage.getItem('portal_token') } catch { /* stockage bloque */ }
    if (token) {
      api.get('/v1/portal/rdv-prefill', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => { const p = { ...EMPTY_FORM, ...r.data }; setPrefill(p); setForm(f => ({ ...p, address: f.address, description: f.description })) })
        .catch(() => {})
    }
  }, [])

  const unit = config?.slot_granularity_minutes || 30
  const minutes = selected.length * unit
  const startTime = selected[0] || null
  const maxMinutes = config ? Math.max(...Object.values(config.duration_rules).map(r => r.max)) : 420
  const steps = ['Technicien', 'Date et heure', 'Votre demande']
  const stepIndex = { tech: 0, slot: 1, details: 2, confirm: 3 }[step]

  async function loadAvailability(who = tech) {
    setLoadingAvail(true); setError('')
    try {
      const r = await api.get('/v1/rdv/availability', { params: { appointment_type: 'plage', duration_minutes: unit, tech: who?.id || 'any' } })
      setAvailability(r.data)
      setSelectedDate(r.data[0]?.date || null)
      setSelected([])
    } catch { setAvailability([]) } finally { setLoadingAvail(false) }
  }

  function chooseTech(t) { setTech(t); setType(null); setStep('slot'); loadAvailability(t) }

  const day = availability.find(d => d.date === selectedDate)
  const free = useMemo(() => new Set(day?.slots || []), [day])

  // Cliquer une plage : la premiere, une voisine (avant/apres) pour allonger, la meme pour l'enlever
  function toggleSlot(t) {
    setError('')
    setSelected(sel => {
      if (!sel.length) return [t]
      const i = sel.indexOf(t)
      if (i === 0) return sel.slice(1)
      if (i === sel.length - 1) return sel.slice(0, -1)
      if (i > 0) return sel.slice(0, i)          // au milieu : on garde ce qui est avant
      if ((sel.length + 1) * unit > maxMinutes) return sel
      if (t === addMin(sel[sel.length - 1], unit) && free.has(t)) return [...sel, t]
      if (t === addMin(sel[0], -unit) && free.has(t)) return [t, ...sel]
      return [t]                                 // pas a cote : nouvelle plage
    })
  }

  useEffect(() => {
    setRangeTech(null)
    if (!selectedDate || !selected.length) { setRangeTechs(null); return }
    let live = true
    setRangeTechs(undefined)
    api.get('/v1/rdv/availability/techs', { params: { date: selectedDate, time: selected[0], duration_minutes: selected.length * unit, tech: tech?.id || 'any' } })
      .then(r => { if (live) setRangeTechs(r.data) }).catch(() => { if (live) setRangeTechs([]) })
    return () => { live = false }
  }, [selectedDate, selected, unit, tech])

  // Type permis pour la plage choisie : duree dans les limites du type (onglet Agenda) ; RDV sur place : pas avant
  // la 1re heure de RDV ni avant le delai en jours -- tout est reverifie au serveur
  function typeProblem(k) {
    if (!config || !startTime) return null
    const r = config.duration_rules[k]
    if (r && (minutes < r.min || minutes > r.max || minutes % r.step !== 0))
      return minutes < r.min ? `Au moins ${fmtDuration(r.min)} : ajoutez des plages.` : `Au plus ${fmtDuration(r.max)}.`
    if (k === 'rdv') {
      const first = new Date(); first.setHours(0, 0, 0, 0); first.setDate(first.getDate() + (config.rdv_min_delay_days ?? 1))
      if (new Date(selectedDate + 'T12:00:00') < first || startTime < config.rdv_earliest_start)
        return `Pas avant ${fmtTime(config.rdv_earliest_start)}, à partir du lendemain : choisissez une autre heure.`
    }
    return null
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // TASK-026.16 : client existant ou nouveau, selon le courriel seulement (jamais selon le nom de compagnie)
  const [client, setClient] = useState(null)
  useEffect(() => {
    const email = form.email.trim()
    setClient(null)
    if (step !== 'details' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return
    let live = true
    const t = setTimeout(() => {
      api.get('/v1/rdv/client', { params: { email } }).then(r => {
        if (!live) return
        setClient(r.data)
        if (r.data.known) setForm(p => ({ ...p, company_name: r.data.company_name }))
      }).catch(() => {})
    }, 600)
    return () => { live = false; clearTimeout(t) }
  }, [form.email, step])
  const known = !!client?.contact_known

  async function submit() {
    setError('')
    if (!type) { setError('Choisissez le type de rendez-vous.'); return }
    if ((!known && (!form.first_name.trim() || !form.last_name.trim())) || !form.email.trim() || !form.phone.trim() || !form.company_name.trim() || !form.description.trim()) {
      setError('Veuillez remplir tous les champs obligatoires.')
      return
    }
    if (type === 'rdv' && !form.address.trim()) { setError("L'adresse de la visite est obligatoire pour un rendez-vous sur place."); return }
    setSubmitting(true)
    try {
      const r = await api.post('/v1/rdv/book', {
        appointment_type: type, date: selectedDate, time: startTime, duration_minutes: minutes,
        address: type === 'rdv' ? form.address : null, description: form.description,
        first_name: form.first_name, last_name: form.last_name, email: form.email, phone: form.phone,
        mobile: form.mobile || null, company_name: form.company_name, tech_id: rangeTech?.id || tech?.id || 'any', urgent,
      })
      setBooking(r.data)
      setStep('confirm')
    } catch (e) {
      if (e.response?.status === 409) {
        setStep('slot')
        await loadAvailability()
        setError("Cette plage vient d'être prise. Choisissez-en une autre.")
      } else {
        setError(e.response?.data?.detail || 'Erreur lors de la réservation.')
      }
    } finally { setSubmitting(false) }
  }

  function back() {
    setError('')
    if (step === 'slot') setStep('tech')
    else if (step === 'details') setStep('slot')
  }

  // Annuler : tout est efface, retour au debut (les coordonnees du portail restent remplies)
  function cancel() {
    setStep('tech'); setTech(null); setUrgent(false); setAvailability([]); setSelectedDate(null); setSelected([])
    setRangeTechs(null); setRangeTech(null); setType(null); setForm(prefill); setError(''); setBooking(null)
  }

  const morning = (day?.slots || []).filter(t => t < '12:00')
  const afternoon = (day?.slots || []).filter(t => t >= '12:00')
  const shownTech = booking?.tech_name || rangeTech?.name || (tech && tech.id !== 'any' ? tech.name : null)
  const typeName = TYPES.find(([k]) => k === type)?.[1]
  const canContinue = selected.length > 0 && Array.isArray(rangeTechs) && rangeTechs.length > 0

  return (
    <div className="rdv-page">
      <header className="rdv-brand">
        <span className="rdv-brand-logo"><img src="/api/v1/rdv/logo" alt="Simple IP" onError={e => { e.currentTarget.parentElement.style.display = 'none' }} /></span>
        <span className="rdv-brand-text">
          <span className="rdv-brand-name">Simple IP</span>
          <span className="rdv-brand-sub">Prise de rendez-vous en ligne</span>
        </span>
      </header>
      <div className="rdv-shell">
        <aside className="rdv-summary">
          <h1 className="rdv-title">Prendre rendez-vous</h1>
          <p className="rdv-trust">Confirmation envoyée par courriel</p>
          <dl className="rdv-facts">
            {urgent && <><dt>Urgence</dt><dd className="rdv-facts-urgent">Oui</dd></>}
            {tech && <><dt>Technicien</dt><dd>{shownTech || 'Premier disponible'}</dd></>}
            {selectedDate && startTime && <><dt>Date</dt><dd>{fmtLongDate(selectedDate)}, <span className="rdv-nowrap">{fmtTime(startTime)} à {fmtTime(addMin(startTime, minutes))}</span></dd></>}
            {startTime && <><dt>Durée</dt><dd>{fmtDuration(minutes)}</dd></>}
            {typeName && <><dt>Type</dt><dd>{typeName}</dd></>}
          </dl>
          {step === 'slot' && availability.length > 0 && (
            // TASK-026.15 : techniciens libres pour la plage choisie, dans le resume a gauche (se construit avec les choix)
            <div className="rdv-range-techs">
              <div className="rdv-range-label">Techniciens disponibles</div>
              {!selected.length ? <div className="rdv-range-hint">Choisissez une ou plusieurs plages.</div>
                : rangeTechs === undefined ? <div className="rdv-range-hint">Recherche…</div>
                : rangeTechs?.length === 0 ? <div className="rdv-range-hint">Aucun technicien n'est libre pour toute cette plage : enlevez une plage ou choisissez une autre heure.</div>
                : (rangeTechs || []).map(t => (
                  <button key={t.id} className={`rdv-range-tech${rangeTech?.id === t.id ? ' selected' : ''}`}
                    onClick={() => setRangeTech(r => (r?.id === t.id ? null : t))}>
                    <span className="rdv-avatar">{t.initials}</span>
                    <span>{t.name}</span>
                  </button>
                ))}
            </div>
          )}
          <div className="rdv-tz">Heure de l'Est (Montréal)</div>
        </aside>

        <main className="rdv-main">
          {step !== 'confirm' && (
            <div className="rdv-progress">
              {steps.map((s, i) => <div key={s} className={`rdv-progress-step${i < stepIndex ? ' done' : ''}${i === stepIndex ? ' current' : ''}`}><span>{i + 1}</span>{s}</div>)}
            </div>
          )}
          {step !== 'tech' && step !== 'confirm' && (
            <div className="rdv-nav">
              <button className="rdv-back" onClick={back}>← Retour</button>
              <button className="rdv-cancel" onClick={cancel}>Annuler</button>
            </div>
          )}
          {error && <div className="rdv-error">{error}</div>}
          {urgent && config?.urgent_notice && <div className="rdv-urgent-notice"><b>Urgence acceptée.</b> {config.urgent_notice}</div>}

          {!config || techs === null ? <div className="rdv-loading">Chargement…</div> : <>
            {step === 'tech' && (
              <section>
                <h2 className="rdv-h2">Choisissez votre technicien</h2>
                <div className="rdv-tech-list">
                  <button className="rdv-tech" onClick={() => chooseTech({ id: 'any' })}>
                    <span className="rdv-avatar any">1er</span>
                    <span><span className="rdv-tech-name">Premier disponible</span><span className="rdv-tech-sub">Le plus de choix d'heures</span></span>
                  </button>
                  {techs.map(t => (
                    <button key={t.id} className="rdv-tech" onClick={() => chooseTech(t)}>
                      <span className="rdv-avatar">{t.initials}</span>
                      <span><span className="rdv-tech-name">{t.name}</span><span className="rdv-tech-sub">Technicien</span></span>
                    </button>
                  ))}
                </div>
                <button className="rdv-urgent" onClick={() => setAskUrgent(true)}>
                  <span className="rdv-urgent-name">Urgence</span>
                </button>
              </section>
            )}

            {step === 'slot' && (
              <section>
                <h2 className="rdv-h2">Choisissez une date et une heure</h2>
                {loadingAvail ? <div className="rdv-loading">Recherche des disponibilités…</div>
                  : availability.length === 0 ? (
                    <div className="rdv-empty">
                      {tech?.next_date
                        ? <>Aucune disponibilité avant le <b>{fmtLongDate(tech.next_date).toLowerCase()}</b>.<br />Choisissez un autre technicien ou « Premier disponible ».</>
                        : <>Aucune disponibilité dans les prochaines semaines. Écrivez-nous ou appelez-nous directement.</>}
                    </div>
                  ) : (<>
                    <p className="rdv-hint">Chaque plage dure {fmtDuration(unit)}. Cliquez les plages qui se suivent pour un rendez-vous plus long ; recliquez une plage pour l'enlever.</p>
                    <div className="rdv-slot-layout">
                        <MonthCalendar days={availability} selected={selectedDate} onSelect={d => { setSelectedDate(d); setSelected([]) }} />
                      <div className="rdv-times">
                        {day && <div className="rdv-times-day">{fmtLongDate(day.date)}</div>}
                        {[['Matin', morning], ['Après-midi', afternoon]].map(([label, list]) => list.length > 0 && (
                          <div key={label}>
                            <div className="rdv-times-label">{label}</div>
                            <div className="rdv-time-grid">
                              {list.map(t => (
                                <button key={t} className={`rdv-time${selected.includes(t) ? ' selected' : ''}`} onClick={() => toggleSlot(t)}>{fmtTime(t)}</button>
                              ))}
                            </div>
                          </div>
                        ))}
                        <button className="rdv-primary" disabled={!canContinue} onClick={() => { setType(null); setStep('details') }}>{selected.length ? `Continuer, ${fmtDuration(minutes)}` : 'Continuer'}</button>
                      </div>
                    </div>
                  </>)}
              </section>
            )}

            {step === 'details' && (
              <section>
                <h2 className="rdv-h2">Votre demande</h2>
                <div className="rdv-type-list">
                  {TYPES.map(([k, name, desc]) => {
                    const problem = typeProblem(k)
                    return (
                      <button key={k} className={`rdv-type${type === k ? ' selected' : ''}`} disabled={!!problem} onClick={() => setType(k)}>
                        <span className="rdv-type-name">{name}</span>
                        <span className="rdv-type-desc">{problem || desc}</span>
                      </button>
                    )
                  })}
                </div>
                <label className="rdv-field rdv-field-desc"><span>Écrivez-nous une brève description *</span><textarea rows={4} value={form.description} onChange={e => f('description', e.target.value)} /></label>
                {type === 'rdv' && <label className="rdv-field"><span>Adresse de la visite *</span><input value={form.address} onChange={e => f('address', e.target.value)} autoComplete="street-address" /></label>}

                <h3 className="rdv-h3">Vos coordonnées</h3>
                <p className="rdv-hint">Déjà client ? Utilisez le courriel que nous avons à votre dossier : le rendez-vous y sera ajouté.</p>
                <label className="rdv-field"><span>Courriel *</span><input type="email" value={form.email} onChange={e => f('email', e.target.value)} autoComplete="email" />
                  {client && <span className={`rdv-client${client.known ? ' known' : ''}`}>{client.known ? <>Client existant : <b>{client.company_name}</b> — le rendez-vous sera ajouté à votre dossier.</> : 'Nouveau client : un dossier sera créé.'}</span>}
                </label>
                <label className="rdv-field"><span>Compagnie *</span><input value={form.company_name} onChange={e => f('company_name', e.target.value)} autoComplete="organization" /></label>
                <div className="rdv-form-grid">
                  {/* contact reconnu par son courriel : pastille « Reconnu », jamais ses vrais nom et prenom (page publique) ;
                      les champs restent modifiables et facultatifs -- la reservation prend les noms de sa fiche */}
                  <label className="rdv-field"><span>Prénom *{known && <em className="rdv-recognized">Reconnu</em>}</span><input value={form.first_name} onChange={e => f('first_name', e.target.value)} autoComplete="given-name" /></label>
                  <label className="rdv-field"><span>Nom *{known && <em className="rdv-recognized">Reconnu</em>}</span><input value={form.last_name} onChange={e => f('last_name', e.target.value)} autoComplete="family-name" /></label>
                  <label className="rdv-field"><span>Téléphone *</span><input type="tel" value={form.phone} onChange={e => f('phone', e.target.value)} autoComplete="tel" /></label>
                  <label className="rdv-field"><span>Cellulaire</span><input type="tel" value={form.mobile} onChange={e => f('mobile', e.target.value)} /></label>
                </div>
                <div className="rdv-actions">
                  <button className="rdv-secondary" onClick={cancel}>Annuler</button>
                  <button className="rdv-primary" onClick={submit} disabled={submitting}>{submitting ? 'Réservation…' : 'Confirmer le rendez-vous'}</button>
                </div>
              </section>
            )}

            {step === 'confirm' && booking && (
              <section className="rdv-confirm">
                <h2 className="rdv-h2">C'est confirmé</h2>
                <p>{urgent ? 'Urgence, ' : ''}{typeName} le <b>{fmtLongDate(selectedDate)}</b> de <b>{fmtTime(startTime)}</b> à <b>{fmtTime(addMin(startTime, minutes))}</b>{booking.tech_name ? <> avec <b>{booking.tech_name}</b></> : null}.</p>
                <p className="rdv-hint">Une confirmation a été envoyée à {form.email}.</p>
              </section>
            )}
          </>}
        </main>
      </div>
      {askUrgent && <UrgenceModal onNo={() => setAskUrgent(false)} onYes={() => { setAskUrgent(false); setUrgent(true); chooseTech({ id: 'any' }) }} />}
    </div>
  )
}
