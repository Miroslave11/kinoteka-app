import { formatVotes, type ImdbRating } from '../../../shared/metadata'

/** Hodnocení z IMDb ve žlutém štítku IMDb, s počtem hlasů. */
export default function ImdbBadge({
  imdb,
  compact
}: {
  imdb: ImdbRating
  compact?: boolean
}): React.JSX.Element {
  const value = imdb.rating.toLocaleString('cs-CZ', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })
  const title = `${imdb.votes.toLocaleString('cs-CZ')} hlasů na IMDb`
  if (compact) {
    return (
      <span className="imdb compact" title={title}>
        ★ {value}
      </span>
    )
  }
  return (
    <span className="imdb" title={title}>
      <b>IMDb</b> {value}
      <small>{formatVotes(imdb.votes)} hlasů</small>
    </span>
  )
}
