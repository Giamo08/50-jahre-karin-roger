import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Submission = {
  id: string
  created_at: string
  photos: {
    storage_path: string
  }
  users: {
    username: string
  }
  challenge_assignments: {
    challenges: {
      title: string
      description: string
      points: number
    }
  }
}

type Props = {
  hostToken: string
  onLogout: () => void
}

type HostQuizState = {
  status: 'waiting' | 'question' | 'revealed' | 'finished'
  question_number: number
  total_questions: number
  question: string | null
  options: string[]
  correct_option: number | null
  points: number
  answer_counts: number[]
  answered_count: number
  player_count: number
}

type AdminAction = 'delete_photos' | 'delete_accounts' | 'reset_quiz' | 'reset_games'

const ADMIN_ACTIONS: Record<AdminAction, {
  title: string
  description: string
  confirmation: string
}> = {
  delete_photos: {
    title: 'Alle Fotos löschen',
    description: 'Löscht alle Dateien aus der Galerie und alle Fotoeinträge dauerhaft.',
    confirmation: 'ALLE FOTOS LÖSCHEN',
  },
  delete_accounts: {
    title: 'Alle Accounts löschen',
    description: 'Löscht alle Gäste, Fotos, Punkte, Antworten und Challenge-Fortschritte.',
    confirmation: 'ALLE ACCOUNTS LÖSCHEN',
  },
  reset_quiz: {
    title: 'Live-Quiz zurücksetzen',
    description: 'Löscht nur die Antworten des Live-Quiz und setzt es auf „Nicht gestartet“ zurück.',
    confirmation: 'LIVE-QUIZ ZURÜCKSETZEN',
  },
  reset_games: {
    title: 'Alle Spiele zurücksetzen',
    description: 'Setzt Challenges, Rätsel, Live-Quiz und sämtliche Punkte zurück. Accounts und Galeriefotos bleiben erhalten.',
    confirmation: 'SPIELE ZURÜCKSETZEN',
  },
}

export default function HostPage({
  hostToken,
  onLogout,
}: Props) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [quiz, setQuiz] = useState<HostQuizState | null>(null)
  const [quizBusy, setQuizBusy] = useState(false)
  const [adminAction, setAdminAction] = useState<AdminAction | null>(null)
  const [adminConfirmation, setAdminConfirmation] = useState('')
  const [adminBusy, setAdminBusy] = useState(false)

  useEffect(() => {
    void loadSubmissions()
    void loadQuiz()
    const timer = window.setInterval(() => void loadQuiz(), 1500)
    return () => window.clearInterval(timer)
  }, [])

  async function loadQuiz() {
    if (!supabase) return
    const { data, error } = await supabase.rpc('get_live_quiz_host', {
      input_host_token: hostToken,
    })
    if (!error && data) {
      setQuiz((Array.isArray(data) ? data[0] : data) as HostQuizState)
    }
  }

  async function quizAction(action: 'start' | 'reveal' | 'next') {
    if (!supabase) return
    try {
      setQuizBusy(true)
      setMessage('')
      const { error } = await supabase.rpc('control_live_quiz', {
        input_host_token: hostToken,
        input_action: action,
      })
      if (error) throw error
      await loadQuiz()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Quiz konnte nicht gesteuert werden.')
    } finally {
      setQuizBusy(false)
    }
  }

  async function removeAllStoredPhotos() {
    if (!supabase) return

    const { data, error } = await supabase.rpc('host_get_all_photo_paths', {
      input_host_token: hostToken,
    })

    if (error) throw error

    const paths = ((data ?? []) as Array<{ storage_path: string }>)
      .map(entry => entry.storage_path)
      .filter(Boolean)

    for (let index = 0; index < paths.length; index += 100) {
      const { error: removeError } = await supabase.storage
        .from('photos')
        .remove(paths.slice(index, index + 100))

      if (removeError) throw removeError
    }
  }

  async function runAdminAction() {
    if (!supabase || !adminAction) return

    const settings = ADMIN_ACTIONS[adminAction]
    if (adminConfirmation !== settings.confirmation) return

    try {
      setAdminBusy(true)
      setMessage('Aktion wird ausgeführt…')

      if (adminAction === 'delete_photos' || adminAction === 'delete_accounts') {
        await removeAllStoredPhotos()
      }

      const { error } = await supabase.rpc('host_admin_action', {
        input_host_token: hostToken,
        input_action: adminAction,
      })

      if (error) throw error

      setMessage(
        adminAction === 'delete_photos'
          ? 'Alle Fotos wurden gelöscht.'
          : adminAction === 'delete_accounts'
            ? 'Alle Accounts und zugehörigen Daten wurden gelöscht.'
            : adminAction === 'reset_quiz'
              ? 'Das Live-Quiz wurde zurückgesetzt und kann neu gestartet werden.'
              : 'Challenges, Rätsel, Live-Quiz und Punkte wurden zurückgesetzt.',
      )
      setAdminAction(null)
      setAdminConfirmation('')
      await loadSubmissions()
      await loadQuiz()
    } catch (error) {
      const rpcError = error as { message?: string; details?: string; hint?: string }
      setMessage(
        [rpcError?.message, rpcError?.details, rpcError?.hint]
          .filter(Boolean)
          .join(' – ') || 'Die Aktion konnte nicht ausgeführt werden.',
      )
    } finally {
      setAdminBusy(false)
    }
  }

  async function loadSubmissions() {
    if (!supabase) return

    try {
      setLoading(true)
      setMessage('')

      const { data, error } = await supabase
        .from('challenge_submissions')
        .select(`
          id,
          created_at,
          photos (
            storage_path
          ),
          users (
            username
          ),
          challenge_assignments (
            challenges (
              title,
              description,
              points
            )
          )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      if (error) throw error

      setSubmissions(
        (data ?? []) as unknown as Submission[],
      )
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Einreichungen konnten nicht geladen werden.',
      )
    } finally {
      setLoading(false)
    }
  }

  function photoUrl(path: string) {
    if (!supabase) return ''

    return supabase.storage
      .from('photos')
      .getPublicUrl(path)
      .data.publicUrl
  }

  async function reviewSubmission(
    submissionId: string,
    approve: boolean,
  ) {
    if (!supabase) return

    try {
      setReviewingId(submissionId)
      setMessage('')

      const { error } = await supabase.rpc(
        'review_challenge_submission',
        {
          submission_id: submissionId,
          approve,
          host_token: hostToken,
        },
      )

      if (error) throw error

      setSubmissions(current =>
        current.filter(
          submission => submission.id !== submissionId,
        ),
      )

      setMessage(
        approve
          ? 'Challenge bestätigt. Punkte wurden vergeben.'
          : 'Challenge abgelehnt. Ein neuer Versuch ist möglich.',
      )
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Bewertung konnte nicht gespeichert werden.',
      )
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <main className="shell">
      <header className="page-header">
        <p className="eyebrow">
          50 Jahre Karin & Roger
        </p>

        <h1>Host-Dashboard</h1>

        <p className="subtle">
          {submissions.length}{' '}
          {submissions.length === 1
            ? 'offene Foto-Challenge'
            : 'offene Foto-Challenges'}
        </p>
      </header>

      <section className="host-quiz-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Live-Quiz</p>
            <h2>Quiz-Steuerung</h2>
          </div>
          <span className={`quiz-state-badge ${quiz?.status ?? 'waiting'}`}>
            {quiz?.status === 'question' ? 'Abstimmung läuft' :
             quiz?.status === 'revealed' ? 'Aufgelöst' :
             quiz?.status === 'finished' ? 'Beendet' : 'Nicht gestartet'}
          </span>
        </div>

        {quiz?.status === 'waiting' && (
          <button className="host-quiz-primary" disabled={quizBusy} onClick={() => void quizAction('start')}>
            Live-Quiz starten
          </button>
        )}

        {quiz && (quiz.status === 'question' || quiz.status === 'revealed') && (
          <>
            <p className="host-quiz-progress">Frage {quiz.question_number} von {quiz.total_questions} · {quiz.points} Punkte</p>
            <h3>{quiz.question}</h3>
            <p className="host-vote-count"><strong>{quiz.answered_count}</strong> von {quiz.player_count} Teilnehmern haben abgestimmt</p>
            <div className="host-answer-bars">
              {quiz.options.map((option, index) => (
                <div className={quiz.status === 'revealed' && quiz.correct_option === index ? 'correct' : ''} key={option}>
                  <span>{String.fromCharCode(65 + index)} · {option}</span>
                  <strong>{quiz.answer_counts[index] ?? 0}</strong>
                </div>
              ))}
            </div>
            {quiz.status === 'question' ? (
              <button className="host-quiz-primary" disabled={quizBusy} onClick={() => void quizAction('reveal')}>
                Antwort auflösen
              </button>
            ) : (
              <button className="host-quiz-primary" disabled={quizBusy} onClick={() => void quizAction('next')}>
                {quiz.question_number === quiz.total_questions ? 'Quiz beenden' : 'Nächste Frage'}
              </button>
            )}
          </>
        )}

        {quiz?.status === 'finished' && <p className="host-quiz-finished">Das Live-Quiz ist beendet.</p>}
      </section>

      <section className="host-toolbar">
        <button
          onClick={() => void loadSubmissions()}
          disabled={loading}
        >
          {loading ? 'Laden…' : 'Aktualisieren'}
        </button>

        <button
          className="text-button"
          onClick={onLogout}
        >
          Host abmelden
        </button>
      </section>

      {message && (
        <p className="status-message">
          {message}
        </p>
      )}

      {loading && (
        <section className="empty-card">
          Einreichungen werden geladen…
        </section>
      )}

      {!loading && submissions.length === 0 && (
        <section className="empty-card">
          <strong>
            Keine offenen Challenges
          </strong>

          <p>
            Momentan wartet kein Foto auf deine
            Bestätigung.
          </p>
        </section>
      )}

      {!loading && (
        <section className="host-submission-list">
          {submissions.map(submission => {
            const challenge =
              submission.challenge_assignments.challenges

            const disabled =
              reviewingId === submission.id

            return (
              <article
                className="host-submission-card"
                key={submission.id}
              >
                <img
                  src={photoUrl(
                    submission.photos.storage_path,
                  )}
                  alt="Eingereichte Foto-Challenge"
                />

                <div className="host-submission-content">
                  <p className="eyebrow">
                    {submission.users.username}
                  </p>

                  <div className="challenge-heading">
                    <h2>
                      {challenge.title}
                    </h2>

                    <strong>
                      +{challenge.points} P.
                    </strong>
                  </div>

                  <p>
                    {challenge.description}
                  </p>

                  <div className="host-actions">
                    <button
                      className="approve-button"
                      disabled={disabled}
                      onClick={() =>
                        void reviewSubmission(
                          submission.id,
                          true,
                        )
                      }
                    >
                      ✓ Erfüllt
                    </button>

                    <button
                      className="reject-button"
                      disabled={disabled}
                      onClick={() =>
                        void reviewSubmission(
                          submission.id,
                          false,
                        )
                      }
                    >
                      ✕ Nicht erfüllt
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      )}

      <section className="host-danger-zone">
        <p className="eyebrow">Administration</p>
        <h2>Gefahrenbereich</h2>
        <p>Diese Aktionen können nicht rückgängig gemacht werden.</p>

        <div className="host-danger-actions">
          {(Object.keys(ADMIN_ACTIONS) as AdminAction[]).map(action => (
            <button
              key={action}
              onClick={() => {
                setAdminAction(action)
                setAdminConfirmation('')
              }}
              disabled={adminBusy}
            >
              {ADMIN_ACTIONS[action].title}
            </button>
          ))}
        </div>

        {adminAction && (
          <div className="host-danger-confirmation">
            <h3>{ADMIN_ACTIONS[adminAction].title}</h3>
            <p>{ADMIN_ACTIONS[adminAction].description}</p>
            <label htmlFor="admin-confirmation">
              Zum Bestätigen exakt eingeben:
              <strong>{ADMIN_ACTIONS[adminAction].confirmation}</strong>
            </label>
            <input
              id="admin-confirmation"
              value={adminConfirmation}
              onChange={event => setAdminConfirmation(event.target.value)}
              autoComplete="off"
            />
            <div>
              <button
                className="danger-confirm-button"
                disabled={
                  adminBusy ||
                  adminConfirmation !== ADMIN_ACTIONS[adminAction].confirmation
                }
                onClick={() => void runAdminAction()}
              >
                {adminBusy ? 'Wird ausgeführt…' : 'Endgültig ausführen'}
              </button>
              <button
                className="danger-cancel-button"
                disabled={adminBusy}
                onClick={() => {
                  setAdminAction(null)
                  setAdminConfirmation('')
                }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
