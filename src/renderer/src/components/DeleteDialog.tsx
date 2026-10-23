import { useEffect, useState } from 'react'
import { TriangleAlert, Trash2, X } from 'lucide-react'
import type { DeletionPlan, DeletionResult } from '../../../shared/deletion'
import { formatSize } from '../../../shared/library'

/** Kolik cest ukázat, než se zbytek shrne do „a N dalších“. */
const SHOWN_PATHS = 5

/**
 * Potvrzení mazání: co přesně se smaže (video i titulky), kolik místa se uvolní
 * a jestli to jde do Koše, nebo trvale (síťový disk).
 */
export default function DeleteDialog({
  heading,
  fileIds,
  onClose,
  onDeleted
}: {
  heading: string
  fileIds: number[]
  onClose: () => void
  /** Po úspěšném smazání (třeba návrat ze stránky filmu, který zmizel). */
  onDeleted?: () => void
}): React.JSX.Element {
  const { deletion } = window.kinoteka
  const [plan, setPlan] = useState<DeletionPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DeletionResult | null>(null)

  useEffect(() => {
    void deletion.plan(fileIds).then(setPlan)
  }, [deletion, fileIds])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const run = async (): Promise<void> => {
    setBusy(true)
    const done = await deletion.execute(fileIds)
    setBusy(false)
    if (done.failed.length === 0) {
      onClose()
      onDeleted?.()
    } else {
      setResult(done)
    }
  }

  const paths = plan?.files.flatMap((f) => [f.path, ...f.subtitles]) ?? []
  const subtitleCount = plan?.files.reduce((sum, f) => sum + f.subtitles.length, 0) ?? 0
  const unavailable = plan?.files.filter((f) => !f.available).length ?? 0

  return (
    <div className="dialog-backdrop" onClick={() => !busy && onClose()}>
      <div
        className="dialog delete-dialog"
        role="alertdialog"
        aria-label={heading}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h3>{heading}</h3>
          <button className="icon-btn sm" onClick={onClose} disabled={busy} title="Zavřít (Esc)">
            <X size={18} />
          </button>
        </header>

        {!plan ? (
          <p className="muted">Zjišťuji, co se smaže…</p>
        ) : result ? (
          <>
            <p>
              Smazáno {result.deleted} z {plan.files.length}. Tyto soubory se smazat nepodařilo:
            </p>
            <ul className="delete-failed">
              {result.failed.map((f) => (
                <li key={f.path}>
                  <code>{f.path}</code>
                  <span>{f.message}</span>
                </li>
              ))}
            </ul>
            <div className="dialog-foot">
              <button className="btn sm" onClick={onClose}>
                Zavřít
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              Smaže se {plan.files.length === 1 ? 'video' : `${plan.files.length} videí`}
              {subtitleCount > 0 &&
                ` a ${subtitleCount} ${subtitleCount === 1 ? 'soubor' : 'soubory'} titulků`}{' '}
              ({formatSize(plan.totalSize)}). Záznamy v deníku a tvé hodnocení zůstanou.
            </p>
            <div className="delete-paths">
              {paths.slice(0, SHOWN_PATHS).map((path) => (
                <code key={path}>{path}</code>
              ))}
              {paths.length > SHOWN_PATHS && (
                <span className="muted small">… a {paths.length - SHOWN_PATHS} dalších</span>
              )}
            </div>
            {plan.network ? (
              <div className="warnbox">
                <TriangleAlert size={18} />
                <span>
                  Soubory jsou na síťovém disku – smazání je <b>trvalé</b>, Koš Windows tam
                  nefunguje. Pokud máš na Synology zapnutý Koš, najdeš je ve složce #recycle.
                </span>
              </div>
            ) : (
              <p className="muted small">Soubory se přesunou do Koše, odkud je jde obnovit.</p>
            )}
            {unavailable > 0 && (
              <p className="notice is-error">
                {unavailable === plan.files.length
                  ? 'Soubory teď nejsou'
                  : 'Některé soubory teď nejsou'}{' '}
                dostupné (offline složka) – ty se nesmažou.
              </p>
            )}
            <div className="dialog-foot">
              <button className="btn sm" onClick={onClose} disabled={busy}>
                Zrušit
              </button>
              <button
                className="btn sm danger"
                onClick={() => void run()}
                disabled={busy || unavailable === plan.files.length}
              >
                <Trash2 size={16} />
                {busy ? 'Mažu…' : plan.network ? 'Smazat trvale' : 'Smazat do Koše'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
