import { csfdRatingTone, type CsfdData } from '../../../shared/csfd'

/** Hodnocení ČSFD v barvách ČSFD (červená ≥ 70 %, modrá ≥ 30 %, šedá méně). */
export default function CsfdRating({
  csfd,
  compact
}: {
  csfd: CsfdData
  compact?: boolean
}): React.JSX.Element {
  const tone = csfdRatingTone(csfd.rating)
  const label = csfd.rating === null ? '? %' : `${csfd.rating} %`
  const count = csfd.ratingCount
    ? `${csfd.ratingCount.toLocaleString('cs-CZ')} hodnocení na ČSFD`
    : 'Zatím bez hodnocení na ČSFD'
  return (
    <span className={`csfd-rating ${tone} ${compact ? 'compact' : ''}`} title={count}>
      {compact ? label : `ČSFD ${label}`}
    </span>
  )
}
