import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './index.css'

type Player = {
  id: string
  username: string
  points: number
}

const STORAGE_KEY = 'karin-roger-player'

export default function App() {
  const [player, setPlayer] = useState<Player | null>(null)
  const [username, setUsername] = useState('')
  const [leaderboard, setLeaderboard] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)
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

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    const cleanName = username.trim()
    if (!cleanName) return
    if (!supabase) {
      setMessage('Supabase ist noch nicht verbunden. Trage zuerst die Zugangsdaten in .env.local ein.')
      return
    }

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

  const rank = useMemo(() => {
    if (!player || leaderboard.length === 0) return null
    const index = leaderboard.findIndex((entry) => entry.id === player.id)
    return index >= 0 ? index + 1 : null
  }, [leaderboard, player])

  if (!player) {
    return (
      <main className="shell login-shell">
        <section className="hero-card">
          <p className="eyebrow">Geburtstagsfest</p>
          <h1>50 Jahre<br />Karin & Roger</h1>
          <p className="subtle">Gib deinen Benutzernamen ein und los geht's.</p>
          <form onSubmit={handleLogin} className="login-form">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Benutzername"
              maxLength={30}
              autoComplete="nickname"
            />
            <button disabled={loading}>{loading ? 'Anmelden…' : 'Starten'}</button>
          </form>
          {message && <p className="error">{message}</p>}
        </section>
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
        <div className="score-card"><strong>{player.points}</strong><span>Punkte</span></div>
      </header>

      <section className="rank-card">
        <span>Dein aktueller Platz</span>
        <strong>{rank ? `#${rank}` : '–'}</strong>
      </section>

      <section className="menu-grid">
        <button className="menu-card" disabled><span>📷</span><strong>Fotogalerie</strong><small>kommt als Nächstes</small></button>
        <button className="menu-card" disabled><span>🎯</span><strong>Foto-Challenges</strong><small>kommt als Nächstes</small></button>
        <button className="menu-card" disabled><span>🧩</span><strong>Rätsel</strong><small>kommt als Nächstes</small></button>
        <button className="menu-card" disabled><span>🏆</span><strong>Live-Quiz</strong><small>kommt als Nächstes</small></button>
      </section>

      <section className="leaderboard-card">
        <div className="section-heading">
          <div><p className="eyebrow">Rangliste</p><h2>Top 3</h2></div>
        </div>
        <ol>
          {leaderboard.slice(0, 3).map((entry, index) => (
            <li key={entry.id}>
              <span>{index + 1}. {entry.username}</span>
              <strong>{entry.points} P.</strong>
            </li>
          ))}
          {leaderboard.length === 0 && <li><span>Noch keine Einträge</span></li>}
        </ol>
      </section>

      <button
        className="text-button"
        onClick={() => {
          localStorage.removeItem(STORAGE_KEY)
          setPlayer(null)
        }}
      >
        Benutzer wechseln
      </button>
    </main>
  )
}
