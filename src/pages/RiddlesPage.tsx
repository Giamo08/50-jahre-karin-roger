import { FormEvent, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Player } from '../types'

type CurrentRiddle = {
  id: string | null
  riddle_number: number
  question: string | null
  points: number
  solved_count: number
  total_count: number
  completed: boolean
}

type AnswerResult = {
  correct: boolean
  points_awarded: number
  completed: boolean
}

type Props = {
  player: Player
  onBack: () => void
}

export default function RiddlesPage({ player, onBack }: Props) {
  const [riddle, setRiddle] = useState<CurrentRiddle | null>(null)
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')
  const nextTimer = useRef<number | null>(null)

  useEffect(() => {
    void loadCurrentRiddle()

    return () => {
      if (nextTimer.current !== null) {
        window.clearTimeout(nextTimer.current)
      }
    }
  }, [])

  async function loadCurrentRiddle() {
    if (!supabase) return

    try {
      setLoading(true)

      const { data, error } = await supabase.rpc(
        'get_current_riddle',
        { input_user_id: player.id },
      )

      if (error) throw error

      const current = Array.isArray(data) ? data[0] : data
      setRiddle((current ?? null) as CurrentRiddle | null)
      setAnswer('')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Rätsel konnten nicht geladen werden.',
      )
      setMessageType('error')
    } finally {
      setLoading(false)
    }
  }

  async function submitAnswer(event: FormEvent) {
    event.preventDefault()

    const cleanAnswer = answer.trim()
    if (!cleanAnswer || !riddle?.id || !supabase || checking) return

    try {
      setChecking(true)
      setMessage('Antwort wird geprüft…')
      setMessageType('')

      const { data, error } = await supabase.rpc(
        'submit_riddle_answer',
        {
          input_user_id: player.id,
          input_riddle_id: riddle.id,
          input_answer: cleanAnswer,
        },
      )

      if (error) throw error

      const result = (Array.isArray(data) ? data[0] : data) as AnswerResult

      if (!result?.correct) {
        setMessage('Noch nicht richtig – versuche es noch einmal.')
        setMessageType('error')
        return
      }

      setMessage(`Richtig! +${result.points_awarded} Punkte`)
      setMessageType('success')
      setAnswer('')

      nextTimer.current = window.setTimeout(() => {
        setMessage('')
        setMessageType('')
        void loadCurrentRiddle()
      }, 1000)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Antwort konnte nicht geprüft werden.',
      )
      setMessageType('error')
    } finally {
      setChecking(false)
    }
  }

  return (
    <main className="shell">
      <header className="page-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>

        <p className="eyebrow">50 Jahre Karin & Roger</p>
        <h1>Rätsel</h1>

        {riddle && (
          <p className="subtle">
            {riddle.solved_count} von {riddle.total_count} gelöst
          </p>
        )}
      </header>

      {loading && (
        <section className="empty-card">Rätsel wird geladen…</section>
      )}

      {!loading && riddle?.completed && (
        <section className="riddle-finished-card">
          <span>🏆</span>
          <h2>Alle Rätsel gelöst!</h2>
          <p>Du hast die komplette Rätselrunde geschafft.</p>
          <button onClick={onBack}>Zurück zur Übersicht</button>
        </section>
      )}

      {!loading && riddle && !riddle.completed && riddle.id && (
        <section className="riddle-card">
          <div className="riddle-meta">
            <span>Rätsel {riddle.riddle_number}</span>
            <strong>+{riddle.points} P.</strong>
          </div>

          <h2>{riddle.question}</h2>

          <form className="riddle-form" onSubmit={submitAnswer}>
            <label htmlFor="riddle-answer">Deine Antwort</label>
            <input
              id="riddle-answer"
              value={answer}
              onChange={event => setAnswer(event.target.value)}
              placeholder="Antwort eingeben"
              autoComplete="off"
              disabled={checking || messageType === 'success'}
            />

            <button
              disabled={!answer.trim() || checking || messageType === 'success'}
            >
              {checking ? 'Wird geprüft…' : 'Antwort prüfen'}
            </button>
          </form>

          {message && (
            <p className={`riddle-message ${messageType}`} aria-live="polite">
              {message}
            </p>
          )}
        </section>
      )}

      {!loading && !riddle && (
        <section className="empty-card">
          <strong>Keine Rätsel verfügbar</strong>
          <p>Bitte versuche es später erneut.</p>
        </section>
      )}
    </main>
  )
}
