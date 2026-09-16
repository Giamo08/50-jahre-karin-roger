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

export default function HostPage({
  hostToken,
  onLogout,
}: Props) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadSubmissions()
  }, [])

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
    </main>
  )
}