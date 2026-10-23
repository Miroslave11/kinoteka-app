import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import type { AppInfo } from '../../../shared/api'
import { IMDB_ATTRIBUTION } from '../../../shared/metadata'

/** Nastavení → O aplikaci: verze, uvedení zdrojů dat a licencí, složky s daty. */
export default function AboutApp(): React.JSX.Element {
  const { app, versions } = window.kinoteka
  const [info, setInfo] = useState<AppInfo | null>(null)

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
