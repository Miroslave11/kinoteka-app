import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { languageName } from '../../../shared/languages'

/** Jazyky v nabídce „Přidat jazyk“. */
const LANGUAGE_CHOICES = ['cs', 'sk', 'en', 'de', 'fr', 'es', 'it', 'pl', 'hu', 'ru', 'ja', 'ko']

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** Seřazený seznam preferovaných jazyků (nahoru, dolů, odebrat, přidat). */
export default function LanguageList({
  languages,
  onChange
}: {
  languages: string[]
  onChange: (languages: string[]) => void
}): React.JSX.Element {
  const move = (index: number, by: number): void => {
    const next = [...languages]
    const [moved] = next.splice(index, 1)
    next.splice(index + by, 0, moved!)
    onChange(next)
  }

  return (
    <>
      <ol className="lang-list">
        {languages.map((code, index) => (
          <li key={code}>
            <span>{capitalize(languageName(code))}</span>
            <button
              className="icon-btn xs"
              title="Výš"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp size={14} />
            </button>
            <button
              className="icon-btn xs"
              title="Níž"
              disabled={index === languages.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={14} />
            </button>
            <button
              className="icon-btn xs"
              title="Odebrat"
              onClick={() => onChange(languages.filter((c) => c !== code))}
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ol>
      <select
        className="field"
        value=""
        aria-label="Přidat jazyk"
        onChange={(event) => event.target.value && onChange([...languages, event.target.value])}
      >
        <option value="">Přidat jazyk…</option>
        {LANGUAGE_CHOICES.filter((code) => !languages.includes(code)).map((code) => (
          <option key={code} value={code}>
            {capitalize(languageName(code))}
          </option>
        ))}
      </select>
    </>
  )
}
