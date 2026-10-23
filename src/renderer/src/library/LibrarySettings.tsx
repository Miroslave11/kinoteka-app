import { useEffect, useState, type FormEvent } from 'react'
import { FolderPlus, HardDrive, Network, Play, RefreshCw, Server, Trash2 } from 'lucide-react'
import {
  formatRelativeTime,
  formatSize,
  type AddFolderResult,
  type LibraryFolder,
  type ScanResult
} from '../../../shared/library'
import { useLibrary } from './useLibrary'

function describeScan(results: ScanResult[]): string {
  const sum = (key: 'added' | 'updated' | 'moved' | 'removed'): number =>
    results.reduce((total, result) => total + result[key], 0)
  const offline = results.filter((result) => !result.online).length
  const parts = [
    `${sum('added')} nových`,
    `${sum('updated')} změněných`,
    `${sum('moved')} přesunutých`,
    `${sum('removed')} odebraných`
  ]
  return `Sken dokončen: ${parts.join(', ')}${offline ? ` · nedostupné složky: ${offline}` : ''}.`
}

export default function LibrarySettings(): React.JSX.Element {
  const { library, player } = window.kinoteka
  const { folders, files, progress, loading } = useLibrary()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [networkPath, setNetworkPath] = useState<string | null>(null)
  const [autoScan, setAutoScan] = useState<boolean | null>(null)
  useEffect(() => {
    void library.autoScan().then(setAutoScan)
  }, [library])
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null)

  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      await work()
    } finally {
      setBusy(false)
    }
  }

  const handleAdded = (result: AddFolderResult): void => {
    if (result.ok) {
      setMessage({ text: `Složka „${result.folder.name}“ přidána. ${describeScan([result.scan])}` })
      setNetworkPath(null)
    } else if (result.reason === 'error') {
      setMessage({ text: result.message, error: true })
    }
  }

  const addNetwork = (event: FormEvent): void => {
    event.preventDefault()
    if (networkPath) void run(async () => handleAdded(await library.addFolder(networkPath)))
  }

  const scan = (folderId?: number): Promise<void> =>
    run(async () => setMessage({ text: describeScan(await library.scan(folderId)) }))

  const playFile = async (id: number): Promise<void> => {
    const result = await player.playFile({ fileId: id, from: 'beginning' })
    if (!result.ok && result.reason === 'error') setMessage({ text: result.message, error: true })
  }

  const folderById = new Map(folders.map((folder) => [folder.id, folder]))

  return (
    <div className="s-stack">
      <section className="card">
        <h2>Složky s filmy a seriály</h2>
        {!loading && folders.length === 0 && (
          <p className="empty">
            Zatím žádná složka. Přidej lokální složku nebo síťovou složku na NAS.
          </p>
        )}
        {folders.map((folder) => (
          <FolderRow
            key={folder.id}
            folder={folder}
            scanning={progress[folder.id]?.found}
            confirming={confirmRemove === folder.id}
            busy={busy}
            onScan={() => void scan(folder.id)}
            onRemove={() => setConfirmRemove(folder.id)}
            onConfirmRemove={(yes) => {
              setConfirmRemove(null)
              if (yes) void run(() => library.removeFolder(folder.id))
            }}
          />
        ))}

        {networkPath !== null && (
          <form className="network-form" onSubmit={addNetwork}>
            <input
              autoFocus
              value={networkPath}
              onChange={(event) => setNetworkPath(event.target.value)}
              placeholder="\\NAS\video\Filmy"
              spellCheck={false}
            />
            <button className="btn primary sm" disabled={busy || !networkPath.trim()}>
              Přidat
            </button>
            <button type="button" className="btn sm" onClick={() => setNetworkPath(null)}>
              Zrušit
            </button>
          </form>
        )}

        <div className="actions">
          <button
            className="btn sm"
            disabled={busy}
            onClick={() => void run(async () => handleAdded(await library.pickFolder()))}
          >
            <FolderPlus size={16} /> Přidat složku
          </button>
          <button className="btn sm" disabled={busy} onClick={() => setNetworkPath('\\\\')}>
            <Network size={16} /> Přidat síťovou složku (\\NAS\…)
          </button>
          <span className="spacer" />
          <button
            className="btn sm"
            disabled={busy || folders.length === 0}
            onClick={() => void scan()}
          >
            <RefreshCw size={16} className={busy ? 'spin' : ''} /> Skenovat vše
          </button>
        </div>
        {message && <p className={`notice ${message.error ? 'is-error' : ''}`}>{message.text}</p>}
        <label className="toggle-row auto-scan">
          <input
            type="checkbox"
            checked={autoScan ?? true}
            disabled={autoScan === null}
            onChange={() => {
              const next = !autoScan
              setAutoScan(next)
              void library.setAutoScan(next)
            }}
          />
          <span>Automatický sken při startu a každých 30 minut</span>
        </label>
      </section>

      <section className="card">
        <h2>
          Nalezené soubory <small>{files.length} · jak je aplikace našla na disku</small>
        </h2>
        {files.length > 0 && (
          <table className="files">
            <thead>
              <tr>
                <th />
                <th>Soubor</th>
                <th>Složka</th>
                <th className="num">Velikost</th>
                <th>Stav</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id} className={file.available ? '' : 'is-unavailable'}>
                  <td>
                    <button
                      className="icon-btn sm"
                      title="Přehrát"
                      disabled={!file.available}
                      onClick={() => void playFile(file.id)}
                    >
                      <Play size={14} fill="currentColor" />
                    </button>
                  </td>
                  <td className="file-name" title={file.path}>
                    {file.fileName}
                  </td>
                  <td className="muted">
                    {folderById.get(file.folderId)?.name}
                    {file.relativePath.includes('\\') &&
                      ` \\ ${file.relativePath.slice(0, file.relativePath.lastIndexOf('\\'))}`}
                  </td>
                  <td className="num">{formatSize(file.size)}</td>
                  <td>{file.available ? 'dostupný' : 'nedostupný'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

interface FolderRowProps {
  folder: LibraryFolder
  scanning?: number
  confirming: boolean
  busy: boolean
  onScan: () => void
  onRemove: () => void
  onConfirmRemove: (yes: boolean) => void
}

function FolderRow(props: FolderRowProps): React.JSX.Element {
  const { folder } = props
  const Icon = folder.kind === 'network' ? Server : HardDrive
  const kind = folder.kind === 'network' ? 'Síťová složka' : 'Lokální disk'
  const status = !folder.online
    ? 'nedostupná – položky zůstávají v knihovně, nic se nemaže'
    : `${folder.fileCount} souborů`
  const scanned = folder.lastScanAt ? ` · sken ${formatRelativeTime(folder.lastScanAt)}` : ''

  return (
    <div className="folder">
      <span className="folder-icon">
        <Icon size={18} />
      </span>
      <div className="folder-info">
        <code>{folder.path}</code>
        <small className={folder.online ? '' : 'warn'}>
          {kind} · {props.scanning !== undefined ? `skenuji… ${props.scanning} souborů` : status}
          {scanned}
        </small>
      </div>
      <span
        className={`dot ${folder.online ? '' : 'off'}`}
        title={folder.online ? 'dostupná' : 'nedostupná'}
      />
      {props.confirming ? (
        <div className="confirm">
          Odebrat z knihovny? Soubory na disku zůstanou.
          <button className="btn sm danger" onClick={() => props.onConfirmRemove(true)}>
            Odebrat
          </button>
          <button className="btn sm" onClick={() => props.onConfirmRemove(false)}>
            Ne
          </button>
        </div>
      ) : (
        <div className="row-actions">
          <button
            className="icon-btn sm"
            title="Skenovat"
            disabled={props.busy}
            onClick={props.onScan}
          >
            <RefreshCw size={15} />
          </button>
          <button className="icon-btn sm" title="Odebrat z knihovny" onClick={props.onRemove}>
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
