import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
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

type Page = 'home' | 'gallery'

const STORAGE_KEY = 'karin-roger-player'

export default function App() {
  const [player, setPlayer] = useState<Player | null>(null)
  const [username, setUsername] = useState('')
  const [leaderboard, setLeaderboard] = useState<Player[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [page, setPage] = useState<Page>('home')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) setPlayer(JSON.parse(saved))
  }, [])

  useEffect(() => {
    void loadLeaderboard()
  }, [player])

  async function loadLeaderboard() {
    if (!supabase) return

    const { data } = await supabase
      .from('users')
      .select('id, username, points')
      .order('points', { ascending: false })
      .limit(100)

    if (data) setLeaderboard(data)
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

    const { data, error } = await supabase.rpc('get_or_create_user', {
      input_username: cleanName,
    })

    setLoading(false)

    if (error || !data?.length) {
      setMessage(error?.message ?? 'Anmeldung fehlgeschlagen.')
      return
    }

    const nextPlayer = data[0] as Player
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPlayer))
    setPlayer(nextPlayer)
    setUsername('')
  }

  async function compressImage(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file)

    const maxSize = 1600
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))

    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')

    if (!context) {
      bitmap.close()
      throw new Error('Bild konnte nicht verarbeitet werden.')
    }

    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => {
          if (blob) resolve(blob)
          else reject(new Error('Bild konnte nicht komprimiert werden.'))
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

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(filename, compressed, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { error: databaseError } = await supabase
        .from('photos')
        .insert({
          user_id: player.id,
          storage_path: filename,
        })

      if (databaseError) {
        await supabase.storage.from('photos').remove([filename])
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

  function switchUser() {
    localStorage.removeItem(STORAGE_KEY)
    setPlayer(null)
    setPage('home')
    setPhotos([])
    setMessage('')
  }

  const rank = useMemo(() => {
    if (!player || leaderboard.length === 0) return null

    const index = leaderboard.findIndex(entry => entry.id === player.id)
    return index >= 0 ? index + 1 : null
  }, [leaderboard, player])

  if (!player) {
    return (
      <main className="shell login-shell">
        <section className="hero-card">
          <p className="eyebrow">Geburtstagsfest</p>
          <h1>
            50 Jahre
            <br />
            Karin & Roger
          </h1>

          <p className="subtle">
            Gib deinen Benutzernamen ein und los geht&apos;s.
          </p>

          <form onSubmit={handleLogin} className="login-form">
            <input
              value={username}
              onChange={event => setUsername(event.target.value)}
              placeholder="Benutzername"
              maxLength={30}
              autoComplete="nickname"
            />

            <button disabled={loading}>
              {loading ? 'Anmelden…' : 'Starten'}
            </button>
          </form>

          {message && <p className="error">{message}</p>}
        </section>
      </main>
    )
  }

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

          <p className="eyebrow">50 Jahre Karin & Roger</p>
          <h1>Fotogalerie</h1>
          <p className="subtle">
            Teile deine Fotos vom Abend mit allen Gästen.
          </p>
        </header>

        <section className="upload-card">
          <label className={`upload-button ${uploading ? 'disabled' : ''}`}>
            {uploading ? 'Foto wird hochgeladen…' : 'Foto aufnehmen / auswählen'}

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

          {message && (
            <p className={message.includes('erfolgreich') ? 'success' : 'status-message'}>
              {message}
            </p>
          )}
        </section>

        <section className="gallery-grid">
          {photos.map(photo => (
            <article className="photo-card" key={photo.id}>
              <img
                src={photoUrl(photo.storage_path)}
                alt={`Foto von ${photo.users?.username ?? 'Gast'}`}
                loading="lazy"
              />

              <div className="photo-info">
                <strong>{photo.users?.username ?? 'Gast'}</strong>
              </div>
            </article>
          ))}
        </section>

        {photos.length === 0 && (
          <section className="empty-card">
            <strong>Noch keine Fotos</strong>
            <p>Sei der Erste und lade ein Foto hoch.</p>
          </section>
        )}
      </main>
    )
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">50 Jahre Karin & Roger</p>
          <h1>Hallo, {player.username}</h1>
        </div>

        <div className="score-card">
          <strong>{player.points}</strong>
          <span>Punkte</span>
        </div>
      </header>

      <section className="rank-card">
        <span>Dein aktueller Platz</span>
        <strong>{rank ? `#${rank}` : '–'}</strong>
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
          <strong>Fotogalerie</strong>
          <small>Fotos ansehen & hochladen</small>
        </button>

        <button className="menu-card" disabled>
          <span>🎯</span>
          <strong>Foto-Challenges</strong>
          <small>kommt als Nächstes</small>
        </button>

        <button className="menu-card" disabled>
          <span>🧩</span>
          <strong>Rätsel</strong>
          <small>kommt als Nächstes</small>
        </button>

        <button className="menu-card" disabled>
          <span>🏆</span>
          <strong>Live-Quiz</strong>
          <small>kommt als Nächstes</small>
        </button>
      </section>

      <section className="leaderboard-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Rangliste</p>
            <h2>Top 3</h2>
          </div>
        </div>

        <ol>
          {leaderboard.slice(0, 3).map((entry, index) => (
            <li key={entry.id}>
              <span>
                {index + 1}. {entry.username}
              </span>
              <strong>{entry.points} P.</strong>
            </li>
          ))}

          {leaderboard.length === 0 && (
            <li>
              <span>Noch keine Einträge</span>
            </li>
          )}
        </ol>
      </section>

      <button className="text-button" onClick={switchUser}>
        Benutzer wechseln
      </button>
    </main>
  )
}