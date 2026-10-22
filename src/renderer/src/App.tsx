import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'

export default function App(): React.JSX.Element {
  const { versions, player } = window.kinoteka
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => player.onClosed((info) => setError(info.error ?? null)), [player])

  const openFile = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const result = await player.openFile()
    setBusy(false)
    if (!result.ok && result.reason === 'error') setError(result.message)
  }

  return (
    <main className="welcome">
      <div className="brand">
        <span className="brand-mark" />
        Kinotéka
      </div>
      <p className="lead">
        Technický test přehrávače – vyber film a vyzkoušej obraz, zvuk a ovládání.
      </p>
      <button className="btn primary" onClick={openFile} disabled={busy}>
        <FolderOpen size={18} />
        {busy ? 'Spouštím…' : 'Otevřít soubor…'}
      </button>
      {error && <p className="error">{error}</p>}
      <p className="versions">
        Electron {versions.electron} · Chromium {versions.chrome} · Node {versions.node}
      </p>
    </main>
  )
}
