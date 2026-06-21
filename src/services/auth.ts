export interface AuthSession {
  userId: string
  token: string
}

export interface AuthService {
  signIn(email: string, password: string): Promise<AuthSession>
  signOut(): Promise<void>
  getSession(): Promise<AuthSession | null>
}
