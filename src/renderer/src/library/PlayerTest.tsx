import { useState } from 'react'
import { FolderOpen } from 'lucide-react'

/** Ruční otevření libovolného souboru – zůstává pro testování přehrávače. */
export default function PlayerTest(): React.JSX.Element {
  const { versions, player } = window.kinoteka
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openFile = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const result = await player.openFile()
    setBusy(false)
    if (!result.ok && result.reason === 'error') setError(result.message)
  }

  return (
    <section className="card">
      <h2>Test přehrávače</h2>
      <p className="muted">Přehraje libovolný soubor z disku, i mimo knihovnu.</p>
      <div className="actions">
        <button className="btn primary" onClick={openFile} disabled={busy}>
          <FolderOpen size={18} />
          {busy ? 'Spouštím…' : 'Otevřít soubor…'}
        </button>
      </div>
      {error && <p className="notice is-error">{error}</p>}
      <p className="versions">
        Kinotéka · Electron {versions.electron} · Chromium {versions.chrome} · Node {versions.node}
      </p>
    </section>
  )
}
