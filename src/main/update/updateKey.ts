import type { UpdateKey } from '../../shared/update'

/** Repozitář s vydáními (instalátor + latest.yml). Je soukromý – čte se s klíčem z aplikace. */
export const RELEASES_OWNER = 'Miroslave11'
export const RELEASES_REPO = 'kinoteka-vydani'

/**
 * Datum vypršení klíče z hlavičky GitHubu `github-authentication-token-expiration`
 * („2027-10-25 08:00:00 UTC“ nebo „… +0200“) jako ISO; klíč bez vypršení hlavičku nemá.
 */
export function parseKeyExpiration(header: string | null): string | null {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (UTC|[+-]\d{4})$/.exec(
    header?.trim() ?? ''
  )
  if (!match) return null
  const zone = match[3] === 'UTC' ? 'Z' : `${match[3]!.slice(0, 3)}:${match[3]!.slice(3)}`
  const date = new Date(`${match[1]}T${match[2]}${zone}`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Ověří klíč pro aktualizace u GitHubu: platí, a do kdy. Neplatný (vypršelý, smazaný) klíč
 * GitHub odmítne s 401, klíč bez přístupu k repozitáři vrátí 404.
 */
export async function checkUpdateKey(fetchImpl: typeof fetch, token: string): Promise<UpdateKey> {
  let response: Response
  try {
    response = await fetchImpl(`https://api.github.com/repos/${RELEASES_OWNER}/${RELEASES_REPO}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      signal: AbortSignal.timeout(30_000)
    })
  } catch {
    return { status: 'unknown', expiresAt: null }
  }
  if (response.status === 401 || response.status === 404)
    return { status: 'invalid', expiresAt: null }
  if (!response.ok) return { status: 'unknown', expiresAt: null }
  return {
    status: 'ok',
    expiresAt: parseKeyExpiration(response.headers.get('github-authentication-token-expiration'))
  }
}
