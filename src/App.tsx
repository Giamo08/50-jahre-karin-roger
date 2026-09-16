import { FormEvent, useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import { supabase } from './lib/supabase'
import ChallengesPage from './pages/ChallengesPage'
import HostPage from './pages/HostPage'
import RiddlesPage from './pages/RiddlesPage'
import QuizPage from './pages/QuizPage'
import './index.css'

type Player = {
  id: string
  username: string
  points: number
}

type Photo = {
  id: string
  storage_path: string
  created_at: string
  user_id: string
  users?: {
    username: string
  } | null
}

type Page = 'home' | 'gallery' | 'challenges' | 'riddles' | 'quiz'

const STORAGE_KEY = 'karin-roger-player'
const HOST_TOKEN_KEY = 'karin-roger-host-token'

export default function App() {
  const [player, setPlayer] = useState<Player | null>(null)
  const [hostToken, setHostToken] = useState<string | null>(null)

  const [username, setUsername] = useState('')
  const [leaderboard, setLeaderboard] = useState<Player[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])

  const [page, setPage] = useState<Page>('home')

  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [downloadingGallery, setDownloadingGallery] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const savedPlayer = localStorage.getItem(STORAGE_KEY)
    const savedHostToken = sessionStorage.getItem(HOST_TOKEN_KEY)

    if (savedHostToken) {
      setHostToken(savedHostToken)
      return
    }

    if (savedPlayer) {
      try {
        setPlayer(JSON.parse(savedPlayer))
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  useEffect(() => {
    if (player) {
      void loadLeaderboard()
    }
  }, [player])

  useEffect(() => {
    if (!selectedPhoto) return

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedPhoto(null)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [selectedPhoto])

  async function loadLeaderboard() {
    if (!supabase) return

    const { data } = await supabase
      .from('users')
      .select('id, username, points')
      .order('points', { ascending: false })
      .limit(100)

    if (data) {
      setLeaderboard(data)

      if (player) {
        const updatedPlayer = data.find(
          entry => entry.id === player.id,
        )

        if (updatedPlayer) {
          setPlayer(updatedPlayer)

          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(updatedPlayer),
          )
        }
      }
    }
  }

  async function loadPhotos() {
    if (!supabase) return

    const { data, error } = await supabase
      .from('photos')
      .select(`
        id,
        storage_path,
        created_at,
        user_id,
        users (
          username
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      return
    }

    setPhotos((data ?? []) as unknown as Photo[])
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault()

    const cleanName = username.trim()

    if (!cleanName || !supabase) return

    setLoading(true)
    setMessage('')

    try {
      // Genau 6 Ziffern werden als Host-PIN geprüft
      if (/^\d{6}$/.test(cleanName)) {
        const { data, error } = await supabase.rpc(
          'host_login',
          {
            input_pin: cleanName,
          },
        )

        if (error) {
          setMessage('Host-Kürzel ist nicht korrekt.')
          return
        }

        if (!data) {
          setMessage('Host-Anmeldung fehlgeschlagen.')
          return
        }

        const token = data as string

        sessionStorage.setItem(
          HOST_TOKEN_KEY,
          token,
        )

        localStorage.removeItem(STORAGE_KEY)

        setPlayer(null)
        setHostToken(token)
        setUsername('')

        return
      }

      // Normaler Gast-Login
      const { data, error } = await supabase.rpc(
        'get_or_create_user',
        {
          input_username: cleanName,
        },
      )

      if (error || !data?.length) {
        setMessage(
          error?.message ??
            'Anmeldung fehlgeschlagen.',
        )
        return
      }

      const nextPlayer = data[0] as Player

      sessionStorage.removeItem(HOST_TOKEN_KEY)

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(nextPlayer),
      )

      setHostToken(null)
      setPlayer(nextPlayer)
      setUsername('')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Anmeldung fehlgeschlagen.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function compressImage(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file)

    const maxSize = 1600

    const scale = Math.min(
      1,
      maxSize / Math.max(bitmap.width, bitmap.height),
    )

    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')

    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')

    if (!context) {
      bitmap.close()

      throw new Error(
        'Bild konnte nicht verarbeitet werden.',
      )
    }

    context.drawImage(
      bitmap,
      0,
      0,
      width,
      height,
    )

    bitmap.close()

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => {
          if (blob) {
            resolve(blob)
          } else {
            reject(
              new Error(
                'Bild konnte nicht komprimiert werden.',
              ),
            )
          }
        },
        'image/jpeg',
        0.82,
      )
    })
  }

  async function handlePhotoUpload(file?: File) {
    if (!file || !player || !supabase) return

    try {
      setUploading(true)
      setMessage('Foto wird vorbereitet…')

      const compressed = await compressImage(file)

      const filename =
        `${player.id}/${crypto.randomUUID()}.jpg`

      const { error: uploadError } =
        await supabase.storage
          .from('photos')
          .upload(filename, compressed, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: false,
          })

      if (uploadError) {
        throw uploadError
      }

      const { error: databaseError } =
        await supabase
          .from('photos')
          .insert({
            user_id: player.id,
            storage_path: filename,
          })

      if (databaseError) {
        await supabase.storage
          .from('photos')
          .remove([filename])

        throw databaseError
      }

      setMessage('Foto erfolgreich hochgeladen.')

      await loadPhotos()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Foto konnte nicht hochgeladen werden.',
      )
    } finally {
      setUploading(false)
    }
  }

  function photoUrl(path: string) {
    if (!supabase) return ''

    return supabase.storage
      .from('photos')
      .getPublicUrl(path)
      .data.publicUrl
  }

  async function downloadGallery() {
    if (photos.length === 0 || downloadingGallery) return

    try {
      setDownloadingGallery(true)
      setMessage(`Galerie wird vorbereitet: 0 von ${photos.length}`)
      const zip = new JSZip()

      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index]
        const response = await fetch(photoUrl(photo.storage_path))

        if (!response.ok) {
          throw new Error(`Foto ${index + 1} konnte nicht geladen werden.`)
        }

        const blob = await response.blob()
        const safeName = (photo.users?.username ?? 'Gast')
          .replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, '-')
        const number = String(index + 1).padStart(3, '0')

        zip.file(`${number}-${safeName}.jpg`, blob)
        setMessage(`Galerie wird vorbereitet: ${index + 1} von ${photos.length}`)
      }

      const archive = await zip.generateAsync({ type: 'blob' })
      const downloadUrl = URL.createObjectURL(archive)
      const link = document.createElement('a')

      link.href = downloadUrl
      link.download = '50-jahre-karin-roger-fotogalerie.zip'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(downloadUrl)

      setMessage('Galerie wurde erfolgreich heruntergeladen.')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Galerie konnte nicht heruntergeladen werden.',
      )
    } finally {
      setDownloadingGallery(false)
    }
  }

  // ==========================================
  // BENUTZER WECHSELN
  // ==========================================

  function switchUser() {
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(HOST_TOKEN_KEY)

    window.location.reload()
  }

  // ==========================================
  // HOST ABMELDEN
  // ==========================================

  function logoutHost() {
    sessionStorage.removeItem(HOST_TOKEN_KEY)
    localStorage.removeItem(STORAGE_KEY)

    window.location.reload()
  }

  const rank = useMemo(() => {
    if (!player || leaderboard.length === 0) {
      return null
    }

    const index = leaderboard.findIndex(
      entry => entry.id === player.id,
    )

    return index >= 0 ? index + 1 : null
  }, [leaderboard, player])

  // ==========================================
  // HOST
  // ==========================================

  if (hostToken) {
    return (
      <HostPage
        hostToken={hostToken}
        onLogout={logoutHost}
      />
    )
  }

  // ==========================================
  // LOGIN
  // ==========================================

  if (!player) {
    return (
      <main className="shell login-shell">
        <section className="hero-card">
          <p className="eyebrow">
            Geburtstagsfest
          </p>

          <h1>
            50 Jahre
            <br />
            Karin & Roger
          </h1>

          <p className="subtle">
            Gib deinen Benutzernamen ein und los
            geht&apos;s.
          </p>

          <form
            onSubmit={handleLogin}
            className="login-form"
          >
            <input
              value={username}
              onChange={event =>
                setUsername(event.target.value)
              }
              placeholder="Benutzername"
              maxLength={30}
              autoComplete="off"
            />

            <button disabled={loading}>
              {loading
                ? 'Anmelden…'
                : 'Starten'}
            </button>
          </form>

          {message && (
            <p className="error">
              {message}
            </p>
          )}
        </section>
      </main>
    )
  }

  // ==========================================
  // FOTO-CHALLENGES
  // ==========================================

  if (page === 'challenges') {
    return (
      <ChallengesPage
        player={player}
        onBack={() => {
          setPage('home')
          setMessage('')

          void loadLeaderboard()
        }}
      />
    )
  }

  // ==========================================
  // RÄTSEL
  // ==========================================

  if (page === 'riddles') {
    return (
      <RiddlesPage
        player={player}
        onBack={() => {
          setPage('home')
          setMessage('')

          void loadLeaderboard()
        }}
      />
    )
  }

  if (page === 'quiz') {
    return (
      <QuizPage
        player={player}
        onBack={() => {
          setPage('home')
          setMessage('')
          void loadLeaderboard()
        }}
      />
    )
  }

  // ==========================================
  // GALERIE
  // ==========================================

  if (page === 'gallery') {
    return (
      <main className="shell">
        <header className="page-header">
          <button
            className="back-button"
            onClick={() => {
              setPage('home')
              setMessage('')
            }}
          >
            ← Zurück
          </button>

          <p className="eyebrow">
            50 Jahre Karin & Roger
          </p>

          <h1>Fotogalerie</h1>

          <p className="subtle">
            Teile deine Fotos vom Abend mit allen
            Gästen.
          </p>
        </header>

        <section className="upload-card">
          <div className="upload-choice-grid">
            <label className={`upload-button ${uploading ? 'disabled' : ''}`}>
              {uploading ? 'Wird hochgeladen…' : '📷 Foto aufnehmen'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={uploading}
                onChange={event => {
                  const file = event.target.files?.[0]
                  void handlePhotoUpload(file)
                  event.target.value = ''
                }}
              />
            </label>

            <label className={`upload-secondary-button ${uploading ? 'disabled' : ''}`}>
              🖼️ Foto hochladen
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={event => {
                  const file = event.target.files?.[0]
                  void handlePhotoUpload(file)
                  event.target.value = ''
                }}
              />
            </label>
          </div>

          <button
            className="gallery-download-button"
            disabled={downloadingGallery || photos.length === 0}
            onClick={() => void downloadGallery()}
          >
            {downloadingGallery
              ? 'Galerie wird vorbereitet…'
              : `Gesamte Galerie herunterladen (${photos.length})`}
          </button>

          {message && (
            <p
              className={
                message.includes('erfolgreich')
                  ? 'success'
                  : 'status-message'
              }
            >
              {message}
            </p>
          )}
        </section>

        <section className="gallery-grid">
          {photos.map(photo => (
            <article
              className="photo-card"
              key={photo.id}
            >
              <button
                className="photo-open-button"
                onClick={() => setSelectedPhoto(photo)}
                aria-label={`Foto von ${photo.users?.username ?? 'Gast'} groß anzeigen`}
              >
                <img
                  src={photoUrl(photo.storage_path)}
                  alt={`Foto von ${photo.users?.username ?? 'Gast'}`}
                  loading="lazy"
                />
              </button>

              <div className="photo-info">
                <strong>
                  {photo.users?.username ??
                    'Gast'}
                </strong>
              </div>
            </article>
          ))}
        </section>

        {selectedPhoto && (
          <div
            className="photo-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Große Fotoansicht"
            onClick={() => setSelectedPhoto(null)}
          >
            <button
              className="lightbox-close"
              onClick={() => setSelectedPhoto(null)}
              aria-label="Fotoansicht schließen"
            >
              ×
            </button>

            <figure onClick={event => event.stopPropagation()}>
              <img
                src={photoUrl(selectedPhoto.storage_path)}
                alt={`Foto von ${selectedPhoto.users?.username ?? 'Gast'}`}
              />
              <figcaption>
                Foto von <strong>{selectedPhoto.users?.username ?? 'Gast'}</strong>
              </figcaption>
            </figure>
          </div>
        )}

        {photos.length === 0 && (
          <section className="empty-card">
            <strong>
              Noch keine Fotos
            </strong>

            <p>
              Sei der Erste und lade ein Foto hoch.
            </p>
          </section>
        )}
      </main>
    )
  }

  // ==========================================
  // STARTSEITE
  // ==========================================

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">
            50 Jahre Karin & Roger
          </p>

          <h1>
            Hallo, {player.username}
          </h1>
        </div>

        <div className="score-card">
          <strong>
            {player.points}
          </strong>

          <span>Punkte</span>
        </div>
      </header>

      <section className="rank-card">
        <span>
          Dein aktueller Platz
        </span>

        <strong>
          {rank ? `#${rank}` : '–'}
        </strong>
      </section>

      <section className="menu-grid">
        <button
          className="menu-card"
          onClick={() => {
            setPage('gallery')
            setMessage('')

            void loadPhotos()
          }}
        >
          <span>📷</span>

          <strong>
            Fotogalerie
          </strong>

          <small>
            Fotos ansehen & hochladen
          </small>
        </button>

        <button
          className="menu-card"
          onClick={() => {
            setPage('challenges')
            setMessage('')
          }}
        >
          <span>🎯</span>

          <strong>
            Foto-Challenges
          </strong>

          <small>
            4 Aufgaben entdecken
          </small>
        </button>

        <button
          className="menu-card"
          onClick={() => {
            setPage('riddles')
            setMessage('')
          }}
        >
          <span>🧩</span>

          <strong>
            Rätsel
          </strong>

          <small>
            Rätsel lösen & Punkte sammeln
          </small>
        </button>

        <button
          className="menu-card"
          onClick={() => {
            setPage('quiz')
            setMessage('')
          }}
        >
          <span>🏆</span>

          <strong>
            Live-Quiz
          </strong>

          <small>
            Gemeinsam live spielen
          </small>
        </button>
      </section>

      <section className="leaderboard-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              Rangliste
            </p>

            <h2>Top 3</h2>
          </div>
        </div>

        <ol>
          {leaderboard
            .slice(0, 3)
            .map((entry, index) => (
              <li key={entry.id}>
                <span>
                  {index + 1}.{' '}
                  {entry.username}
                </span>

                <strong>
                  {entry.points} P.
                </strong>
              </li>
            ))}

          {leaderboard.length === 0 && (
            <li>
              <span>
                Noch keine Einträge
              </span>
            </li>
          )}
        </ol>
      </section>

      <button
        className="text-button"
        onClick={switchUser}
      >
        Benutzer wechseln
      </button>
    </main>
  )
}
