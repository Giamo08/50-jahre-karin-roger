import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Player } from '../types'

type QuizState = {
  status: 'waiting' | 'question' | 'revealed' | 'finished'
  question_id: string | null
  question_number: number
  total_questions: number
  question: string | null
  options: string[]
  points: number
  selected_option: number | null
  correct_option: number | null
  answer_correct: boolean | null
}

type Props = { player: Player; onBack: () => void }

export default function QuizPage({ player, onBack }: Props) {
  const [quiz, setQuiz] = useState<QuizState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadQuiz()
    const timer = window.setInterval(() => void loadQuiz(), 1500)
    return () => window.clearInterval(timer)
  }, [])

  async function loadQuiz() {
    if (!supabase) return
    const { data, error } = await supabase.rpc('get_live_quiz', {
      input_user_id: player.id,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    const next = (Array.isArray(data) ? data[0] : data) as QuizState
    setQuiz(next)
  }

  async function chooseAnswer(option: number) {
    if (!supabase || !quiz?.question_id || quiz.selected_option !== null) return

    try {
      setSubmitting(true)
      setMessage('')
      const { error } = await supabase.rpc('submit_live_quiz_answer', {
        input_user_id: player.id,
        input_question_id: quiz.question_id,
        input_option: option,
      })
      if (error) throw error
      await loadQuiz()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Antwort konnte nicht gespeichert werden.')
    } finally {
      setSubmitting(false)
    }
  }

  function optionClass(index: number) {
    if (!quiz) return 'quiz-option'
    const classes = ['quiz-option']
    if (quiz.selected_option === index) classes.push('selected')
    if (quiz.status === 'revealed' && quiz.correct_option === index) classes.push('correct')
    if (quiz.status === 'revealed' && quiz.selected_option === index && quiz.correct_option !== index) classes.push('wrong')
    return classes.join(' ')
  }

  return (
    <main className="shell">
      <header className="page-header">
        <button className="back-button" onClick={onBack}>← Zurück</button>
        <p className="eyebrow">50 Jahre Karin & Roger</p>
        <h1>Live-Quiz</h1>
      </header>

      {(!quiz || quiz.status === 'waiting') && (
        <section className="quiz-waiting-card">
          <span>⏳</span>
          <h2>Warten auf den Start</h2>
          <p>Der Host startet das Quiz für alle Gäste.</p>
        </section>
      )}

      {quiz && (quiz.status === 'question' || quiz.status === 'revealed') && (
        <section className="live-quiz-card">
          <div className="riddle-meta">
            <span>Frage {quiz.question_number} von {quiz.total_questions}</span>
            <strong>+{quiz.points} P.</strong>
          </div>

          <h2>{quiz.question}</h2>

          <div className="quiz-options">
            {quiz.options.map((option, index) => (
              <button
                key={option}
                className={optionClass(index)}
                disabled={submitting || quiz.selected_option !== null || quiz.status === 'revealed'}
                onClick={() => void chooseAnswer(index)}
              >
                <span>{String.fromCharCode(65 + index)}</span>
                {option}
              </button>
            ))}
          </div>

          {quiz.status === 'question' && quiz.selected_option === null && (
            <p className="quiz-hint">Wähle eine Antwort. Sie kann danach nicht mehr geändert werden.</p>
          )}

          {quiz.status === 'question' && quiz.selected_option !== null && (
            <p className="quiz-locked">✓ Antwort gespeichert – warte auf die Auflösung.</p>
          )}

          {quiz.status === 'revealed' && (
            <div className={`quiz-result ${quiz.answer_correct ? 'correct' : 'wrong'}`}>
              <strong>{quiz.answer_correct ? '✓ Richtig!' : '✕ Leider falsch'}</strong>
              <span>Richtige Antwort: {quiz.options[quiz.correct_option ?? 0]}</span>
            </div>
          )}
        </section>
      )}

      {quiz?.status === 'finished' && (
        <section className="riddle-finished-card">
          <span>🏆</span>
          <h2>Quiz beendet!</h2>
          <p>Alle Fragen wurden gespielt. Die Punkte stehen in der Rangliste.</p>
          <button onClick={onBack}>Zurück zur Übersicht</button>
        </section>
      )}

      {message && <p className="status-message">{message}</p>}
    </main>
  )
}
