import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, FolderSearch, Plus, RefreshCw } from 'lucide-react'
import { plural } from '../../../shared/plural'
import type { YtCategory, YtStatus } from '../../../shared/yt'

type Notice = { text: string; error?: boolean } | null

const videosLabel = (count: number): string =>
  `${count} ${plural(count, 'video', 'videa', 'videí')}`

/** Klíčová slova kategorie jako text oddělený čárkami; uloží se po opuštění pole. */
function KeywordsField({
  category,
  onSave
}: {
  category: YtCategory
  onSave: (keywords: string[]) => Promise<void>
}): React.JSX.Element {
  const saved = category.keywords.join(', ')
  const [text, setText] = useState(saved)
  useEffect(() => setText(saved), [saved])
  return (
    <textarea
      className="field yt-keywords"
      rows={3}
      aria-label={`Klíčová slova kategorie ${category.name}`}
      placeholder="slova oddělená čárkou"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text.trim() === saved) return
        void onSave(text.split(',').map((k) => k.trim()))
      }}
    />
  )
}

const ROLE_HINT = {
  music: 'Sem jde hudba (podle YouTube), která nepatří do jiné kategorie.',
  other: 'Sem jde vše, co nepatří jinam.'
} as const

/**
 * Nastavení → YT videa: složka, kategorie (podsložky) a jejich klíčová slova. Přehled videí
 * v kategoriích slouží k ověření zařazení, dokud nebude hotová stránka YT videa.
 */
export default function YtSettings(): React.JSX.Element {
  const { yt } = window.kinoteka
  const [status, setStatus] = useState<YtStatus | null>(null)
  const [categories, setCategories] = useState<YtCategory[]>([])
  const [scanning, setScanning] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [newName, setNewName] = useState('')

  const reload = useCallback(async () => {
    const [info, list] = await Promise.all([yt.status(), yt.listCategories()])
    setStatus(info)
    setCategories(list)
  }, [yt])

  useEffect(() => {
    void reload()
    return yt.onChanged(() => void reload())
  }, [yt, reload])

  const scan = async (): Promise<void> => {
    setScanning(true)
    setNotice(null)
    try {
      const result = await yt.scan()
      const sorted = result.sorted > 0 ? `, nově zařazeno ${videosLabel(result.sorted)}` : ''
      setNotice(
        result.errors.length > 0
          ? { text: result.errors.join('\n'), error: true }
          : { text: `Hotovo: ${videosLabel(result.videos)}${sorted}.` }
      )
    } catch (error) {
      setNotice({ text: (error as Error).message, error: true })
    } finally {
      setScanning(false)
      await reload()
    }
  }

  const manage = async (action: Parameters<typeof yt.manage>[0]): Promise<boolean> => {
    const result = await yt.manage(action)
    if (!result.ok) setNotice({ text: result.message, error: true })
    return result.ok
  }

  const addCategory = async (): Promise<void> => {
    if (await manage({ kind: 'create-category', name: newName })) setNewName('')
  }

  return (
    <div className="s-stack">
      <section className="card">
        <h2>Složka s YT videi</h2>
        <p className="muted small">
          Každá podsložka je jedna kategorie. Videa vložená přímo do složky se zařadí podle obsahu
          (štítky, název, popis a kanál z YouTube) a přesunou do podsložky.
        </p>
        <div className="key-row">
          <span className="field grow">{status?.folder ?? '…'}</span>
          <button
            className="btn sm"
            onClick={() =>
              void yt.pickFolder().then(async (folder) => {
                if (folder) await reload()
              })
            }
          >
            <FolderSearch size={16} /> Změnit…
          </button>
          <button className="btn sm" onClick={() => void yt.openFolder()}>
            <FolderOpen size={16} /> Otevřít
          </button>
          <button className="btn sm" disabled={scanning} onClick={() => void scan()}>
            <RefreshCw size={16} className={scanning ? 'spin' : ''} /> Proskenovat
          </button>
        </div>
        {status && status.pendingInfo > 0 && (
          <p className="muted small">
            Dotahuji údaje z YouTube k {videosLabel(status.pendingInfo)}, pak se zařadí…
          </p>
        )}
        {notice && <p className={`notice ${notice.error ? 'is-error' : ''}`}>{notice.text}</p>}
      </section>

      <section className="card">
        <h2>Kategorie a klíčová slova</h2>
        <p className="muted small">
          Slova se hledají ve štítcích, názvu, popisu a kanálu videa (bez ohledu na diakritiku a
          velká písmena). Vyhraje kategorie s nejvíc shodami. Název kategorie se počítá jako klíčové
          slovo. Už zařazená videa se nepřesouvají.
        </p>
        <div className="yt-cats">
          {categories.map((category) => (
            <div key={category.id ?? 'waiting'} className="yt-cat">
              <div className="yt-cat-head">
                <strong>{category.name}</strong>
                <span className="muted small">{videosLabel(category.videos.length)}</span>
              </div>
              {category.id === null ? (
                <p className="muted small">Videa v kořeni složky, ke kterým se dotahují údaje.</p>
              ) : category.role ? (
                <p className="muted small">{ROLE_HINT[category.role]}</p>
              ) : (
                <KeywordsField
                  category={category}
                  onSave={async (keywords) => {
                    await manage({ kind: 'set-keywords', categoryId: category.id!, keywords })
                  }}
                />
              )}
              {category.videos.length > 0 && (
                <details className="yt-cat-videos">
                  <summary className="muted small">Videa</summary>
                  <ul>
                    {category.videos.map((video) => (
                      <li key={video.id}>
                        {video.name}
                        {video.channel && <span className="muted"> · {video.channel}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
        <div className="key-row">
          <input
            className="field grow"
            aria-label="Název nové kategorie"
            placeholder="Nová kategorie, třeba Pláže"
            value={newName}
            maxLength={80}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) void addCategory()
            }}
          />
          <button className="btn sm" disabled={!newName.trim()} onClick={() => void addCategory()}>
            <Plus size={16} /> Přidat kategorii
          </button>
        </div>
      </section>
    </div>
  )
}
