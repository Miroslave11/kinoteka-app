import { X } from 'lucide-react'

const SHORTCUTS: [string, string][] = [
  ['Mezerník, K', 'Přehrát / pauza'],
  ['← →, J', 'Zpět / vpřed o 10 s (J = zpět)'],
  ['L', 'Přepnout žárovku (Home Assistant)'],
  ['0 – 9', 'Skok na 0–90 % filmu'],
  ['Home', 'Na začátek'],
  ['↑ ↓', 'Hlasitost'],
  ['M', 'Ztlumit'],
  ['F, dvojklik', 'Celá obrazovka'],
  ['A', 'Další zvuková stopa'],
  ['S', 'Titulky (dokola, i vypnuté)'],
  ['Z / X', 'Posun titulků −0,1 / +0,1 s'],
  ['N / P', 'Další / předchozí díl'],
  ['?', 'Tato nápověda'],
  ['Esc', 'Zavřít panel, opustit celou obrazovku, zpět']
]

/** Přehled klávesových zkratek přehrávače (klávesa ?). */
export default function ShortcutHelp({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div
      className="shortcut-help"
      role="dialog"
      aria-label="Klávesové zkratky"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <header>
        <h4>Klávesové zkratky</h4>
        <button className="icon-btn xs" onClick={onClose} title="Zavřít (Esc)">
          <X size={16} />
        </button>
      </header>
      <dl>
        {SHORTCUTS.map(([keys, action]) => (
          <div key={keys}>
            <dt>{keys}</dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
