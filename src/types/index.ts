export type Player = {
  id: string
  username: string
  points: number
}

export type Photo = {
  id: string
  storage_path: string
  created_at: string
  user_id: string
  users?: {
    username: string
  } | null
}

export type Challenge = {
  id: string
  title: string
  description: string
  points: number
}

export type ChallengeAssignment = {
  id: string
  user_id: string
  challenge_id: string
  batch_number: number
  status: 'open' | 'pending' | 'completed'
  challenge?: Challenge
}