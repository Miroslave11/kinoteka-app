import { useCallback, useEffect, useState } from 'react'
import { Cloud, LogOut, RefreshCw } from 'lucide-react'
import { formatRelativeTime } from '../../../shared/library'
import { MAX_DEVICE_NAME, type SyncStatus } from '../../../shared/sync'

/** Nastavení → Sdílení: deník (a později YT videa) mezi počítači přes Google Disk. */
export default function SyncSettings(): React.JSX.Element {
  const { sync } = window.kinoteka
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')

  const reload = useCallback(
    () =>
      void sync.status().then((next) => {
        setStatus(next)
        setName((current) => current || next.deviceName)
      }),
    [sync]
  )
  useEffect(() => {
    reload()
    return sync.onChanged(reload)
  }, [sync, reload])

  const signIn = async (): Promise<void> => {
    setSigning(true)
    setError(null)
    const result = await sync.signIn()
    setSigning(false)
    if (!result.ok) setError(result.message ?? 'Přihlášení se nepovedlo.')
    reload()
  }

  const saveName = (): void => {
    if (name.trim() && name.trim() !== status?.deviceName) void sync.setDeviceName(name)
  }

  if (status && !status.configured)
    return (
      <section className="card">
        <h2>Sdílení přes Google Disk</h2>
        <p className="muted small">
          Tato verze Kinotéky nemá klíč pro Google, sdílení proto nejde zapnout. Je v instalátoru
          vydaném po nastavení klíče (viz SCOPE-SYNC.md).
        </p>
      </section>
    )

  return (
    <section className="card">
      <h2>Sdílení přes Google Disk</h2>
      <p className="muted small">
        Deník a hodnocení se sdílí mezi všemi počítači přihlášenými ke stejnému účtu Google – doma i
        mimo domácí síť. Kinotéka má přístup jen ke své skryté složce na Google Disku, ostatní
        soubory nevidí. Synchronizuje se po spuštění, chvíli po každé změně a každých 5 minut.
      </p>

      {!status?.signedIn ? (
        <div className="actions">
          <button className="btn primary" disabled={signing} onClick={() => void signIn()}>
            <Cloud size={16} />{' '}
            {signing ? 'Dokonči přihlášení v prohlížeči…' : 'Přihlásit se ke Google'}
          </button>
        </div>
      ) : (
        <>
          <dl className="kv">
            <dt>Účet</dt>
            <dd>{status.email ?? 'přihlášeno'}</dd>
            <dt>Poslední synchronizace</dt>
            <dd>
              {status.running
                ? 'probíhá…'
                : status.lastSyncAt
                  ? formatRelativeTime(status.lastSyncAt)
                  : 'zatím neproběhla'}
            </dd>
            <dt>Další počítače</dt>
            <dd>
              {status.devices.length === 0
                ? 'zatím žádné – přihlas se ke stejnému účtu i na druhém počítači'
                : status.devices
                    .map((d) => `${d.name} (${formatRelativeTime(d.updatedAt)})`)
                    .join(', ')}
            </dd>
          </dl>
          <label className="yt-label" htmlFor="sync-name">
            Název tohoto počítače
          </label>
          <div className="key-row">
            <input
              id="sync-name"
              className="field grow"
              maxLength={MAX_DEVICE_NAME}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName()
              }}
            />
          </div>
          {status.lastError && <p className="notice is-error">{status.lastError}</p>}
          <div className="actions">
            <button
              className="btn sm"
              disabled={status.running}
              onClick={() => void sync.syncNow().then(reload)}
            >
              <RefreshCw size={15} className={status.running ? 'spin' : ''} /> Synchronizovat teď
            </button>
            <button className="btn sm" onClick={() => void sync.signOut().then(reload)}>
              <LogOut size={15} /> Odhlásit
            </button>
          </div>
        </>
      )}
      {error && <p className="notice is-error">{error}</p>}
    </section>
  )
}
