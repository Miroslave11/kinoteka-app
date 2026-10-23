import { useState } from 'react'
import { Star } from 'lucide-react'

/**
 * Hodnocení 1–5 hvězd. S `onChange` jde klikat (klik na stejnou hodnotu hodnocení zruší),
 * bez něj jen ukazuje.
 */
export default function Stars({
  value,
  onChange,
  size = 18
}: {
  value: number | null
  onChange?: (rating: number | null) => void
  size?: number
}): React.JSX.Element {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0

  return (
    <span
      className={`stars ${onChange ? 'is-editable' : ''}`}
      onMouseLeave={() => setHover(null)}
      role={onChange ? 'radiogroup' : 'img'}
      aria-label={value ? `Moje hodnocení ${value} z 5` : 'Bez hodnocení'}
    >
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button
            key={n}
            type="button"
            className={n <= shown ? 'on' : ''}
            title={n === value ? 'Zrušit hodnocení' : `${n} z 5`}
            aria-checked={n === value}
            role="radio"
            onMouseEnter={() => setHover(n)}
            onClick={(event) => {
              event.stopPropagation()
              onChange(n === value ? null : n)
            }}
          >
            <Star size={size} fill="currentColor" />
          </button>
        ) : (
          <span key={n} className={n <= shown ? 'on' : ''}>
            <Star size={size} fill="currentColor" />
          </span>
        )
      )}
    </span>
  )
}
