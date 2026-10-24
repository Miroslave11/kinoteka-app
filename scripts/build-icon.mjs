// Vykreslí build/icon.svg do build/icon.png (512 px) a build/icon.ico (16–256 px).
// Spouští se přes Electron (vykresluje Chromium), bez dalších knihoven: npm run icon
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const build = join(import.meta.dirname, '..', 'build')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/** ICO s obrázky PNG uvnitř (Windows Vista a novější). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  let offset = header.length
  pngs.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i
    header.writeUInt8(size >= 256 ? 0 : size, entry)
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(data.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...pngs.map((p) => p.data)])
}

app.whenReady().then(async () => {
  const svg = readFileSync(join(build, 'icon.svg')).toString('base64')
  const win = new BrowserWindow({ show: false })
  await win.loadURL('data:text/html,<!doctype html><title>icon</title>')
  const sizes = [...ICO_SIZES, 512]
  const rendered = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image()
    img.src = 'data:image/svg+xml;base64,${svg}'
    await img.decode()
    const out = {}
    for (const size of ${JSON.stringify(sizes)}) {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      canvas.getContext('2d').drawImage(img, 0, 0, size, size)
      out[size] = canvas.toDataURL('image/png').split(',')[1]
    }
    return out
  })()`)
  const png = (size) => Buffer.from(rendered[size], 'base64')
  writeFileSync(join(build, 'icon.png'), png(512))
  writeFileSync(join(build, 'icon.ico'), ico(ICO_SIZES.map((size) => ({ size, data: png(size) }))))
  console.log('build/icon.png a build/icon.ico hotové')
  app.quit()
})
