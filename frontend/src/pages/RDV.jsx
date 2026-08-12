import { useState, useEffect } from 'react'
import api from '../services/api'
import './RDV.css'

function durationOptions(rules, type) {
  const r = rules[type]
  const opts = []
  for (let m = r.min; m <= r.max; m += r.step) opts.push(m)
  return opts
}

function fmtDuration(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h${m}`
}

function fmtDateLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('fr-CA', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function RDV() {
  const [step, setStep] = useState('type') // type | duration | slot | form | confirm
  const [config, setConfig] = useState(null)
  const [type, setType] = useState(null) // appel | rdv
  const [duration, setDuration] = useState(null)
  const [availability, setAvailability] = useState([])
  const [loadingAvail, setLoadingAvail] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedTime, setSelectedTime] = useState(null)
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', mobile: '',
    company_name: '', address: '', description: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [booking, setBooking] = useState(null)

  useEffect(() => { api.get('/v1/rdv/config').then(r => setConfig(r.data)) }, [])

  function chooseType(t) {
    setType(t)
    setDuration(config.duration_rules[t].default)
    setStep('duration')
  }

  async function chooseDuration(d) {
    setDuration(d)
    setLoadingAvail(true)
    setStep('slot')
    try {
      const r = await api.get('/v1/rdv/availability', { params: { appointment_type: type, duration_minutes: d } })
      setAvailability(r.data)
      setSelectedDate(r.data[0]?.date || null)
    } finally { setLoadingAvail(false) }
  }

  function pickSlot(date, time) {
    setSelectedDate(date)
    setSelectedTime(time)
    setStep('form')
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function submit() {
    setError('')
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim() || !form.phone.trim() || !form.company_name.trim() || !form.description.trim()) {
      setError('Veuillez remplir tous les champs obligatoires.')
      return
    }
    if (type === 'rdv' && !form.address.trim()) {
      setError("L'adresse de visite est obligatoire pour un rendez-vous.")
      return
    }
    setSubmitting(true)
    try {
      const r = await api.post('/v1/rdv/book', {
        appointment_type: type,
        date: selectedDate,
        time: selectedTime,
        duration_minutes: duration,
        address: type === 'rdv' ? form.address : null,
        description: form.description,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        mobile: form.mobile || null,
        company_name: form.company_name,
      })
      setBooking(r.data)
      setStep('confirm')
    } catch (e) {
      if (e.response?.status === 409) {
        setError("Cette plage vient d'être prise par quelqu'un d'autre. Veuillez choisir une autre plage.")
        setStep('slot')
        const r = await api.get('/v1/rdv/availability', { params: { appointment_type: type, duration_minutes: duration } })
        setAvailability(r.data)
      } else {
        setError(e.response?.data?.detail || 'Erreur lors de la réservation.')
      }
    } finally { setSubmitting(false) }
  }

  const currentDay = availability.find(d => d.date === selectedDate)

  return (
    <div className="rdv-page">
      <div className="rdv-topbar">
        <div className="rdv-brand">Simple IP — Prendre rendez-vous</div>
        {step !== 'type' && step !== 'confirm' && (
          <button className="rdv-back-btn" onClick={() => {
            if (step === 'duration') setStep('type')
            else if (step === 'slot') setStep('duration')
            else if (step === 'form') setStep('slot')
          }}>← Retour</button>
        )}
      </div>

      <div className="rdv-body">
        {!config ? <div className="rdv-loading">Chargement...</div> : (
          <>
            {step === 'type' && (
              <div className="rdv-step">
                <h2 className="rdv-step-title">Quel type de rendez-vous ?</h2>
                <div className="rdv-type-cards">
                  <button className="rdv-type-card" onClick={() => chooseType('appel')}>
                    <div className="rdv-type-icon">📞</div>
                    <div className="rdv-type-name">Appel téléphonique</div>
                    <div className="rdv-type-desc">Un technicien vous rappelle à l'heure choisie. Minimum 1h de préavis.</div>
                  </button>
                  <button className="rdv-type-card" onClick={() => chooseType('rdv')}>
                    <div className="rdv-type-icon">🧑‍🔧</div>
                    <div className="rdv-type-name">Rendez-vous sur place</div>
                    <div className="rdv-type-desc">Un technicien se déplace à votre adresse. Réservable à partir du lendemain.</div>
                  </button>
                </div>
              </div>
            )}

            {step === 'duration' && (
              <div className="rdv-step">
                <h2 className="rdv-step-title">Combien de temps prévoyez-vous ?</h2>
                <div className="rdv-duration-grid">
                  {durationOptions(config.duration_rules, type).map(d => (
                    <button key={d} className={`rdv-duration-btn${d === duration ? ' selected' : ''}`} onClick={() => chooseDuration(d)}>
                      {fmtDuration(d)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 'slot' && (
              <div className="rdv-step">
                <h2 className="rdv-step-title">Choisissez une plage disponible</h2>
                {loadingAvail ? <div className="rdv-loading">Chargement des disponibilités...</div> : (
                  availability.length === 0 ? <div className="rdv-empty">Aucune disponibilité pour le moment, veuillez nous contacter directement.</div> : (
                    <>
                      <div className="rdv-day-scroller">
                        {availability.map(day => (
                          <button
                            key={day.date}
                            className={`rdv-day-chip${day.date === selectedDate ? ' selected' : ''}`}
                            onClick={() => setSelectedDate(day.date)}
                          >
                            {fmtDateLabel(day.date)}
                          </button>
                        ))}
                      </div>
                      {currentDay && (
                        <div className="rdv-slot-grid">
                          {currentDay.slots.map(t => (
                            <button key={t} className="rdv-slot-btn" onClick={() => pickSlot(currentDay.date, t)}>{t}</button>
                          ))}
                        </div>
                      )}
                    </>
                  )
                )}
              </div>
            )}

            {step === 'form' && (
              <div className="rdv-step rdv-form-step">
                <h2 className="rdv-step-title">Vos coordonnées</h2>
                <div className="rdv-recap">
                  {type === 'appel' ? 'Appel' : 'Rendez-vous'} — {fmtDateLabel(selectedDate)} à {selectedTime} ({fmtDuration(duration)})
                </div>
                {error && <div className="rdv-error">{error}</div>}
                <div className="rdv-form-grid">
                  <div className="form-group"><label>Prénom *</label><input value={form.first_name} onChange={e => f('first_name', e.target.value)} /></div>
                  <div className="form-group"><label>Nom *</label><input value={form.last_name} onChange={e => f('last_name', e.target.value)} /></div>
                  <div className="form-group"><label>Compagnie *</label><input value={form.company_name} onChange={e => f('company_name', e.target.value)} /></div>
                  <div className="form-group"><label>Courriel *</label><input type="email" value={form.email} onChange={e => f('email', e.target.value)} /></div>
                  <div className="form-group"><label>Téléphone *</label><input value={form.phone} onChange={e => f('phone', e.target.value)} /></div>
                  <div className="form-group"><label>Cellulaire (optionnel)</label><input value={form.mobile} onChange={e => f('mobile', e.target.value)} /></div>
                </div>
                {type === 'rdv' && (
                  <div className="form-group"><label>Adresse de la visite *</label><input value={form.address} onChange={e => f('address', e.target.value)} /></div>
                )}
                <div className="form-group"><label>Description de la situation *</label><textarea rows={4} value={form.description} onChange={e => f('description', e.target.value)} /></div>
                <button className="rdv-submit-btn" onClick={submit} disabled={submitting}>{submitting ? 'Envoi...' : 'Confirmer la réservation'}</button>
              </div>
            )}

            {step === 'confirm' && booking && (
              <div className="rdv-confirm">
                <div className="rdv-confirm-icon">✓</div>
                <h2>Rendez-vous confirmé</h2>
                <p>
                  Votre {type === 'appel' ? 'appel' : 'rendez-vous'} est confirmé pour le {fmtDateLabel(selectedDate)} à {selectedTime}.
                  Un courriel de confirmation a été acheminé à {form.email}.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
