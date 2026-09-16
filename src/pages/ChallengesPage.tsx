import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { compressImage } from '../utils/images'
import type { Player } from '../types'

type ChallengeAssignment = {
  id: string
  batch_number: number
  status: 'open' | 'pending' | 'completed'
  challenge_id: string
  challenges: {
    id: string
    title: string
    description: string
    points: number
  }
}

type Props = {
  player: Player
  onBack: () => void
}

export default function ChallengesPage({ player, onBack }: Props) {
  const [assignments, setAssignments] = useState<ChallengeAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadChallenges()
  }, [])

  async function loadChallenges() {
    if (!supabase) return

    try {
      setLoading(true)
      setMessage('')

      // Erstes Paket erzeugen, falls noch keines existiert
      const { error: batchError } = await supabase.rpc(
        'get_challenge_batch',
        {
          input_user_id: player.id,
        },
      )

      if (batchError) throw batchError

      // Zuteilungen inklusive Challenge-Daten laden
      const { data, error } = await supabase
        .from('challenge_assignments')
        .select(`
          id,
          batch_number,
          status,
          challenge_id,
          challenges (
            id,
            title,
            description,
            points
          )
        `)
        .eq('user_id', player.id)
        .order('batch_number', { ascending: false })

      if (error) throw error

      if (!data?.length) {
        setAssignments([])
        return
      }

      const currentBatch = data[0].batch_number

      setAssignments(
        data.filter(entry => entry.batch_number === currentBatch) as unknown as ChallengeAssignment[],
      )
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Challenges konnten nicht geladen werden.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function uploadChallengePhoto(
    assignment: ChallengeAssignment,
    file?: File,
  ) {
    if (!file || !supabase) return

    let uploadedPath = ''

    try {
      setUploadingId(assignment.id)
      setMessage('Foto wird vorbereitet…')

      const compressed = await compressImage(file)

      uploadedPath =
        `${player.id}/challenge-${crypto.randomUUID()}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(uploadedPath, compressed, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) throw uploadError

      // Foto auch in der normalen Galerie speichern
      const { data: photo, error: photoError } = await supabase
        .from('photos')
        .insert({
          user_id: player.id,
          storage_path: uploadedPath,
        })
        .select('id')
        .single()

      if (photoError) throw photoError

      // Foto mit der Challenge verknüpfen
      const { error: submissionError } = await supabase.rpc(
        'submit_challenge_photo',
        {
          input_user_id: player.id,
          input_assignment_id: assignment.id,
          input_photo_id: photo.id,
        },
      )

      if (submissionError) throw submissionError

      setMessage('Foto wurde zur Prüfung eingereicht.')
      await loadChallenges()
    } catch (error) {
      // Falls der Datenbankeintrag scheitert, verwaiste Datei entfernen
      if (uploadedPath) {
        await supabase.storage.from('photos').remove([uploadedPath])
      }

      setMessage(
        error instanceof Error
          ? error.message
          : 'Foto konnte nicht eingereicht werden.',
      )
    } finally {
      setUploadingId(null)
    }
  }

  async function loadNextBatch() {
    if (!supabase) return

    try {
      setLoading(true)
      setMessage('')

      const { error } = await supabase.rpc(
        'load_next_challenge_batch',
        {
          input_user_id: player.id,
        },
      )

      if (error) throw error

      await loadChallenges()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Neue Challenges konnten nicht geladen werden.',
      )
    } finally {
      setLoading(false)
    }
  }

  const completed = assignments.filter(
    assignment => assignment.status === 'completed',
  ).length

  const allCompleted =
    assignments.length === 4 && completed === 4

  const batchNumber = assignments[0]?.batch_number ?? 1

  return (
    <main className="shell">
      <header className="page-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>

        <p className="eyebrow">50 Jahre Karin & Roger</p>
        <h1>Foto-Challenges</h1>

        <p className="subtle">
          Paket {batchNumber} · {completed} von 4 erfüllt
        </p>
      </header>

      {loading && (
        <section className="empty-card">
          Challenges werden geladen…
        </section>
      )}

      {!loading && assignments.length === 0 && (
        <section className="empty-card">
          <strong>Keine Challenges verfügbar</strong>
          <p>
            Aktuell konnten keine vier Challenges zugeteilt werden.
          </p>
        </section>
      )}

      {!loading && (
        <section className="challenge-list">
          {assignments.map(assignment => (
            <article
              className={`challenge-card challenge-${assignment.status}`}
              key={assignment.id}
            >
              <div className="challenge-heading">
                <h2>{assignment.challenges.title}</h2>

                <strong>
                  +{assignment.challenges.points} P.
                </strong>
              </div>

              <p>{assignment.challenges.description}</p>

              {assignment.status === 'completed' && (
                <div className="challenge-status completed">
                  ✓ Erfüllt
                </div>
              )}

              {assignment.status === 'pending' && (
                <div className="challenge-status pending">
                  ⏳ Wartet auf Bestätigung
                </div>
              )}

              {assignment.status === 'open' && (
                <div className="upload-choice-grid">
                  <label className={`upload-button ${uploadingId === assignment.id ? 'disabled' : ''}`}>
                    {uploadingId === assignment.id ? 'Wird hochgeladen…' : '📷 Foto aufnehmen'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={uploadingId !== null}
                      onChange={event => {
                        const file = event.target.files?.[0]
                        void uploadChallengePhoto(assignment, file)
                        event.target.value = ''
                      }}
                    />
                  </label>

                  <label className={`upload-secondary-button ${uploadingId === assignment.id ? 'disabled' : ''}`}>
                    🖼️ Foto hochladen
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingId !== null}
                      onChange={event => {
                        const file = event.target.files?.[0]
                        void uploadChallengePhoto(assignment, file)
                        event.target.value = ''
                      }}
                    />
                  </label>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {message && (
        <p className="status-message">{message}</p>
      )}

      {allCompleted && (
        <section className="next-challenges-card">
          <strong>Alle 4 Challenges erfüllt!</strong>

          <p>
            Du kannst jetzt vier neue Aufgaben laden.
          </p>

          <button onClick={() => void loadNextBatch()}>
            4 neue Challenges laden
          </button>
        </section>
      )}
    </main>
  )
}
