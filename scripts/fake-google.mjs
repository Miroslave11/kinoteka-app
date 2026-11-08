// Falešný Google (přihlášení OAuth a Google Disk – složka aplikace) pro vývoj a testy sdílení.
//
//   node scripts/fake-google.mjs [port]      (výchozí 8770)
//
// Kinotéka ve vývoji: KINOTEKA_DEV_GOOGLE_URL=http://127.0.0.1:8770 – přihlášení proběhne bez
// prohlížeče a data se ukládají jen v paměti tohoto serveru (dvě testovací instance je sdílí).
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

/** Spustí falešný Google; vrátí adresu a funkce pro testy. */
export function startFakeGoogle(port = 0, { email = 'test@kinoteka.cz' } = {}) {
  const files = new Map() // id → { id, name, content, modifiedTime }
  const accessTokens = new Set()
  const revoked = new Set()
  let counter = 0
  const next = (prefix) => `${prefix}-${++counter}`

  const idToken = () =>
    ['e30', Buffer.from(JSON.stringify({ email })).toString('base64url'), 'podpis'].join('.')

  const readBody = (request) =>
    new Promise((resolve) => {
      const chunks = []
      request.on('data', (chunk) => chunks.push(chunk))
      request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })

  const json = (response, status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(body))
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    const path = url.pathname

    if (path === '/auth') {
      const target = new URL(url.searchParams.get('redirect_uri'))
      target.searchParams.set('code', next('kod'))
      target.searchParams.set('state', url.searchParams.get('state') ?? '')
      response.writeHead(302, { Location: target.toString() })
      return response.end()
    }
    if (path === '/token' && request.method === 'POST') {
      const body = new URLSearchParams(await readBody(request))
      const access = next('pristup')
      if (body.get('grant_type') === 'refresh_token') {
        if (revoked.has(body.get('refresh_token')))
          return json(response, 400, { error: 'invalid_grant' })
        accessTokens.add(access)
        return json(response, 200, { access_token: access, expires_in: 3600 })
      }
      if (!body.get('code') || !body.get('code_verifier'))
        return json(response, 400, { error: 'invalid_request' })
      accessTokens.add(access)
      return json(response, 200, {
        access_token: access,
        expires_in: 3600,
        refresh_token: next('obnova'),
        id_token: idToken()
      })
    }
    if (path === '/revoke') {
      revoked.add(url.searchParams.get('token'))
      return json(response, 200, {})
    }

    const auth = request.headers.authorization?.replace(/^Bearer /, '')
    if (!accessTokens.has(auth)) return json(response, 401, { error: 'unauthorized' })

    if (path === '/drive/v3/files' && request.method === 'GET') {
      return json(response, 200, {
        files: [...files.values()].map(({ id, name, modifiedTime }) => ({ id, name, modifiedTime }))
      })
    }
    const fileMatch = /^\/drive\/v3\/files\/([^/]+)$/.exec(path)
    if (fileMatch && request.method === 'GET') {
      const file = files.get(fileMatch[1])
      if (!file) return json(response, 404, { error: 'notFound' })
      response.writeHead(200, { 'Content-Type': 'application/json' })
      return response.end(file.content)
    }
    if (path === '/upload/drive/v3/files' && request.method === 'POST') {
      const body = await readBody(request)
      const boundary = /boundary=(.+)$/.exec(request.headers['content-type'] ?? '')?.[1]
      const parts = body
        .split(`--${boundary}`)
        .slice(1, -1)
        .map((part) => part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''))
      const meta = JSON.parse(parts[0])
      const id = next('soubor')
      files.set(id, {
        id,
        name: meta.name,
        content: parts[1],
        modifiedTime: new Date().toISOString()
      })
      return json(response, 200, { id })
    }
    const uploadMatch = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(path)
    if (uploadMatch && request.method === 'PATCH') {
      const file = files.get(uploadMatch[1])
      if (!file) return json(response, 404, { error: 'notFound' })
      file.content = await readBody(request)
      file.modifiedTime = new Date(Date.now() + ++counter).toISOString()
      return json(response, 200, { id: file.id })
    }
    json(response, 404, { error: 'notFound' })
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        files,
        /** Zrušit přihlášení (jako „Odebrat přístup“ v účtu Google). */
        revokeAll: () => {
          for (const token of accessTokens) revoked.add(token)
          accessTokens.clear()
        },
        close: () => new Promise((done) => server.close(() => done()))
      })
    })
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.argv[2] ?? 8770)
  const fake = await startFakeGoogle(port)
  console.log(`Falešný Google běží na ${fake.url}`)
}
