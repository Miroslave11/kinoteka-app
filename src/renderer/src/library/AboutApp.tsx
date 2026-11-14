import { useEffect, useState } from 'react'
import { Download, FolderOpen, RefreshCw } from 'lucide-react'
import type { AppInfo } from '../../../shared/api'
import type { UpdateState } from '../../../shared/update'
import { useUpdateState } from '../components/UpdateBanner'
import { IMDB_ATTRIBUTION } from '../../../shared/metadata'

/** Nastavení → O aplikaci: verze, uvedení zdrojů dat a licencí, složky s daty. */
export default function AboutApp(): React.JSX.Element {
  const { app, versions } = window.kinoteka
  const [info, setInfo] = useState<AppInfo | null>(null)
  const update = useUpdateState()

  useEffect(() => {
    void app.info().then(setInfo)
  }, [app])

  return (
    <div className="s-stack">
      <section className="card">
        <h2>Kinotéka {info?.version ?? ''}</h2>
        <p className="muted">Domácí kino pro filmy a seriály z disku nebo ze Synology.</p>
        <dl className="kv">
          <dt>Přehrávač</dt>
          <dd>mpv {info?.mpv ?? '–'}</dd>
          <dt>Analýza a klipy</dt>
          <dd>FFmpeg {info?.ffmpeg ?? '–'}</dd>
          <dt>Prostředí</dt>
          <dd>
            Electron {versions.electron} · Chromium {versions.chrome} · Node {versions.node}
          </dd>
          <dt>Data</dt>
          <dd>{info?.dataPath ?? '…'}</dd>
        </dl>
        <div className="actions">
          <button className="btn sm" onClick={() => void app.openFolder('data')}>
            <FolderOpen size={16} /> Otevřít složku s daty
          </button>
          <button className="btn sm" onClick={() => void app.openFolder('logs')}>
            <FolderOpen size={16} /> Otevřít záznamy (logy)
          </button>
        </div>
      </section>

      {update && <UpdateCard state={update} />}

      <section className="card">
        <h2>Zdroje dat</h2>
        <div className="credit">
          <span className="tmdb">TMDB</span>
          <p>
            Popisy, plakáty, herci a díly seriálů pocházejí z{' '}
            <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
              The Movie Database (TMDB)
            </a>
            . This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
        </div>
        <div className="credit">
          <span className="imdb">IMDb</span>
          <p>Hodnocení IMDb z oficiálního datového souboru. {IMDB_ATTRIBUTION}</p>
        </div>
        <div className="credit">
          <span className="badge">OpenSubtitles</span>
          <p>
            Titulky z internetu stahuje přes oficiální API{' '}
            <a href="https://www.opensubtitles.com" target="_blank" rel="noreferrer">
              OpenSubtitles.com
            </a>{' '}
            s tvým vlastním klíčem.
          </p>
        </div>
      </section>

      <section className="card">
        <h2>Licence</h2>
        <p className="muted small">
          Kinotéka používá svobodný software: přehrávač{' '}
          <a href="https://mpv.io" target="_blank" rel="noreferrer">
            mpv
          </a>{' '}
          (GPL v2+),{' '}
          <a href="https://ffmpeg.org" target="_blank" rel="noreferrer">
            FFmpeg
          </a>{' '}
          (GPL), Electron a React (MIT) a ikony Lucide (ISC). Zdrojové kódy těchto projektů jsou
          dostupné na jejich stránkách.
        </p>
      </section>
    </div>
  )
}

/** Popis stavu aktualizací jednou větou. */
function describe(state: UpdateState): string {
  switch (state.status) {
    case 'unsupported':
      return 'Ve vývojové verzi se aktualizace nehledají – jen v nainstalované Kinotéce.'
    case 'idle':
      return 'Zatím nezkontrolováno.'
    case 'checking':
      return 'Hledám novou verzi…'
    case 'latest':
      return 'Máš nejnovější verzi.'
    case 'downloading':
      return `Stahuji verzi ${state.version ?? ''}… ${state.percent ?? 0} %`
    case 'ready':
      return `Verze ${state.version ?? ''} je stažená – nainstaluje se při zavření Kinotéky.`
    case 'error':
      return state.message ?? 'Aktualizace se nepovedla.'
  }
}

/** Nastavení → O aplikaci: automatické aktualizace z veřejného repozitáře kinoteka-app. */
function UpdateCard({ state }: { state: UpdateState }): React.JSX.Element {
  const { update } = window.kinoteka
  const unsupported = state.status === 'unsupported'
  const busy = state.status === 'checking' || state.status === 'downloading'
  return (
    <section className="card">
      <h2>Aktualizace</h2>
      <p className={`notice ${state.status === 'error' ? 'is-error' : ''}`}>{describe(state)}</p>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={state.autoCheck}
          disabled={unsupported}
          onChange={() => void update.setAutoCheck(!state.autoCheck)}
        />
        <span>Automaticky hledat novou verzi (po spuštění a každých 6 hodin)</span>
      </label>
      <div className="actions">
        {state.status === 'ready' ? (
          <button className="btn sm primary" onClick={() => void update.install()}>
            <Download size={16} /> Restartovat a nainstalovat
          </button>
        ) : (
          <button
            className="btn sm"
            disabled={unsupported || busy}
            onClick={() => void update.check()}
          >
            <RefreshCw size={16} className={busy ? 'spin' : ''} /> Zkontrolovat teď
          </button>
        )}
      </div>
    </section>
  )
}
