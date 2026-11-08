// Místní zrcadlo Electronu a nástrojů electron-builderu (NSIS, 7zip…) pro sestavení instalátoru.
//
// electron-builder si je stahuje z odkazů vydání github.com/electron/electron
// a github.com/electron-userland/electron-builder-binaries. Ty občas dlouho vrací 504
// (listopad 2026: celé hodiny), zatímco stažení stejných souborů přes API GitHubu funguje.
// Zrcadlo je proto stahuje přes API (s opakováním) a nabídne je na http://127.0.0.1.
// Kontrolní součty ověřuje electron-builder / @electron/get sám, jako u stažení z GitHubu.
//
// Použití: node scripts/eb-mirror.mjs <příkaz…>   (např. node scripts/eb-mirror.mjs npm run dist)
// Spustí zrcadlo, pak příkaz s proměnnými ELECTRON_MIRROR a ELECTRON_BUILDER_BINARIES_MIRROR
// a skončí s jeho kódem.
// Klíč pro API (vyšší limit dotazů): EB_MIRROR_TOKEN, jinak GITHUB_TOKEN; bez klíče to jde také.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'

/** První část cesty → repozitář, jehož vydání zrcadlo nabízí. */
const REPOS = {
  electron: 'electron/electron',
  eb: 'electron-userland/electron-builder-binaries'
}
const ATTEMPTS = 5
const token = process.env.EB_MIRROR_TOKEN || process.env.GITHUB_TOKEN || ''
const headers = {
  'User-Agent': 'kinoteka-ci',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {})
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Opakuje dotaz, dokud GitHub neodpoví bez chyby serveru. */
async function fetchRetrying(url, init) {
  let last
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, init)
      if (response.status < 500) return response
      last = new Error(`HTTP ${response.status}`)
    } catch (error) {
      last = error
    }
    console.warn(`[eb-mirror] ${url}: ${last.message} – pokus ${attempt}/${ATTEMPTS}`)
    await sleep(attempt * 3000)
  }
  throw last
}

/** Soubor z vydání `tag` přes API GitHubu. */
async function download(repo, tag, name) {
  const release = await fetchRetrying(
    `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`,
    { headers }
  )
  if (!release.ok) throw new Error(`vydání ${tag}: HTTP ${release.status}`)
  const asset = (await release.json()).assets?.find((a) => a.name === name)
  if (!asset) throw new Error(`vydání ${tag} nemá soubor ${name}`)
  const file = await fetchRetrying(asset.url, {
    headers: { ...headers, Accept: 'application/octet-stream' }
  })
  if (!file.ok) throw new Error(`${tag}/${name}: HTTP ${file.status}`)
  return Buffer.from(await file.arrayBuffer())
}

const server = createServer((request, response) => {
  // Cesta /<electron|eb>/<vydání>/<soubor>, vydání může obsahovat „@“ (např. nsis@1.2.1).
  const parts = decodeURIComponent(new URL(request.url, 'http://x').pathname)
    .split('/')
    .filter(Boolean)
  const repo = REPOS[parts[0]]
  if (
    request.method !== 'GET' ||
    !repo ||
    parts.length !== 3 ||
    parts.some((p) => p.includes('..'))
  ) {
    response.writeHead(404).end()
    return
  }
  const [, tag, name] = parts
  download(repo, tag, name).then(
    (body) => {
      console.log(`[eb-mirror] ${tag}/${name}: ${body.length} B`)
      response.writeHead(200, { 'Content-Length': body.length }).end(body)
    },
    (error) => {
      console.error(`[eb-mirror] ${tag}/${name}: ${error.message}`)
      response.writeHead(502).end(String(error.message))
    }
  )
})

const command = process.argv.slice(2)
if (command.length === 0) {
  console.error('Použití: node scripts/eb-mirror.mjs <příkaz…>')
  process.exit(2)
}

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address()
  console.log(`[eb-mirror] zrcadlo na http://127.0.0.1:${port}/`)
  const child = spawn(command.join(' '), {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      ELECTRON_MIRROR: `http://127.0.0.1:${port}/electron/`,
      ELECTRON_BUILDER_BINARIES_MIRROR: `http://127.0.0.1:${port}/eb/`,
      ELECTRON_BUILDER_BINARIES_ALLOW_HTTP: 'true'
    }
  })
  child.on('exit', (code, signal) => {
    server.close()
    process.exit(code ?? (signal ? 1 : 0))
  })
})
