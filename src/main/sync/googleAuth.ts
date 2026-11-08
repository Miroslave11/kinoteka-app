import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'

/**
 * Přihlášení ke Google pro aplikaci v počítači (OAuth 2.0, „installed app“): prohlížeč
 * s přihlášením Googlu, návrat na http://127.0.0.1:<port>, kód se vymění za klíče (PKCE).
 * Oprávnění jen ke skryté složce aplikace na Google Disku a e-mailu účtu.
 */

export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.appdata']

export interface GoogleEndpoints {
  auth: string
  token: string
  revoke: string
}

export const GOOGLE_ENDPOINTS: GoogleEndpoints = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke'
}

/** Vývoj a testy: všechno na jednom (falešném) serveru. */
export const endpointsAt = (base: string): GoogleEndpoints => ({
  auth: `${base}/auth`,
  token: `${base}/token`,
  revoke: `${base}/revoke`
})

export interface GoogleClient {
  id: string
  /** U aplikací v počítači Google tajný klíč za tajný nepovažuje (je v každé kopii aplikace). */
  secret: string
}

/** Uložené přihlášení. */
export interface GoogleTokens {
  refreshToken: string
  accessToken: string
  /** Kdy přestane platit `accessToken` (ms od 1970). */
  expiresAt: number
  email: string | null
}

const base64url = (data: Buffer): string => data.toString('base64url')

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function authUrl(
  endpoints: GoogleEndpoints,
  client: GoogleClient,
  redirectUri: string,
  challenge: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: client.id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    // Obnovovací klíč – přihlášení vydrží i po restartu aplikace.
    access_type: 'offline',
    prompt: 'consent'
  })
  return `${endpoints.auth}?${params}`
}

/** E-mail z id_token (JWT; podpis se neověřuje – přišel přímo od Googlu přes HTTPS). */
export function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString())
    return typeof payload.email === 'string' ? payload.email : null
  } catch {
    return null
  }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

async function tokenRequest(
  fetchImpl: FetchLike,
  endpoints: GoogleEndpoints,
  body: Record<string, string>
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(endpoints.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  })
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const reason = typeof json['error'] === 'string' ? json['error'] : `HTTP ${response.status}`
    throw Object.assign(new Error(`Google odmítl přihlášení (${reason}).`), {
      revoked: reason === 'invalid_grant'
    })
  }
  return json
}

/** Platný přístupový klíč: obnoví ho, když (skoro) vypršel. */
export async function refreshTokens(
  fetchImpl: FetchLike,
  endpoints: GoogleEndpoints,
  client: GoogleClient,
  tokens: GoogleTokens,
  now = Date.now()
): Promise<GoogleTokens> {
  if (tokens.expiresAt - 60_000 > now) return tokens
  const json = await tokenRequest(fetchImpl, endpoints, {
    client_id: client.id,
    client_secret: client.secret,
    refresh_token: tokens.refreshToken,
    grant_type: 'refresh_token'
  })
  return {
    ...tokens,
    accessToken: String(json['access_token']),
    expiresAt: now + Number(json['expires_in'] ?? 3600) * 1000
  }
}

export interface SignInOptions {
  fetch: FetchLike
  endpoints: GoogleEndpoints
  client: GoogleClient
  /** Otevře adresu přihlášení (v aplikaci prohlížeč uživatele). */
  open: (url: string) => Promise<void>
  /** Jak dlouho čekat na přihlášení v prohlížeči. */
  timeoutMs?: number
  now?: () => number
}

const PAGE = (title: string, text: string): string =>
  `<!doctype html><meta charset="utf-8"><title>Kinotéka</title>` +
  `<body style="font-family:Segoe UI,sans-serif;background:#111;color:#eee;display:grid;place-items:center;height:90vh">` +
  `<div style="text-align:center"><h2>${title}</h2><p>${text}</p></div>`

/** Přihlášení v prohlížeči; vrátí klíče, nebo chybu (zrušeno, vypršel čas). */
export async function signIn(options: SignInOptions): Promise<GoogleTokens> {
  const { verifier, challenge } = pkcePair()
  const state = base64url(randomBytes(16))
  let server: Server | undefined
  try {
    const code = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
      server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1')
        if (url.pathname !== '/') return void response.writeHead(404).end()
        const error = url.searchParams.get('error')
        const got = url.searchParams.get('code')
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        if (url.searchParams.get('state') !== state || (!got && !error)) {
          return void response.end(PAGE('Neplatná odpověď', 'Zkus se přihlásit znovu z Kinotéky.'))
        }
        if (error || !got) {
          response.end(PAGE('Přihlášení zrušeno', 'Okno můžeš zavřít.'))
          return reject(new Error('Přihlášení bylo zrušeno.'))
        }
        response.end(PAGE('Hotovo', 'Kinotéka je připojená ke Google Disku. Okno můžeš zavřít.'))
        resolve({ code: got, redirectUri })
      })
      let redirectUri = ''
      server.listen(0, '127.0.0.1', () => {
        const address = server!.address()
        const port = typeof address === 'object' && address ? address.port : 0
        redirectUri = `http://127.0.0.1:${port}`
        options
          .open(authUrl(options.endpoints, options.client, redirectUri, challenge, state))
          .catch(reject)
      })
      setTimeout(
        () => reject(new Error('Přihlášení vypršelo – zkus to prosím znovu.')),
        options.timeoutMs ?? 5 * 60_000
      ).unref()
    })
    const json = await tokenRequest(options.fetch, options.endpoints, {
      code: code.code,
      client_id: options.client.id,
      client_secret: options.client.secret,
      redirect_uri: code.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier
    })
    if (typeof json['refresh_token'] !== 'string')
      throw new Error('Google nevrátil obnovovací klíč – zkus se přihlásit znovu.')
    // Google nechává oprávnění zaškrtnout jednotlivě – bez Disku sdílení nefunguje.
    if (typeof json['scope'] === 'string' && !json['scope'].includes('drive.appdata'))
      throw new Error(
        'Při přihlášení nebyl povolen přístup ke Google Disku. Přihlas se znovu a v okně Googlu zaškrtni přístup k datům aplikace na Disku.'
      )
    return {
      refreshToken: json['refresh_token'],
      accessToken: String(json['access_token']),
      expiresAt: (options.now ?? Date.now)() + Number(json['expires_in'] ?? 3600) * 1000,
      email: emailFromIdToken(json['id_token'])
    }
  } finally {
    server?.close()
  }
}

/** Odhlášení: Google zapomene oprávnění (chyba nevadí – klíče se smažou i tak). */
export async function revoke(
  fetchImpl: FetchLike,
  endpoints: GoogleEndpoints,
  token: string
): Promise<void> {
  await fetchImpl(`${endpoints.revoke}?token=${encodeURIComponent(token)}`, {
    method: 'POST'
  }).catch(() => undefined)
}
