import { useState } from 'react'
import { FolderOpen } from 'lucide-react'

/** Ruční otevření libovolného souboru – zůstává pro testování přehrávače. */
export default function PlayerTestPage(): React.JSX.Element {
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
    <div className="welcome">
      <p className="lead">Technický test přehrávače – vyber libovolný soubor z disku.</p>
      <button className="btn primary" onClick={openFile} disabled={busy}>
        <FolderOpen size={18} />
        {busy ? 'Spouštím…' : 'Otevřít soubor…'}
      </button>
      {error && <p className="notice is-error">{error}</p>}
      <p className="versions">
        Electron {versions.electron} · Chromium {versions.chrome} · Node {versions.node}
      </p>
    </div>
  )
}
