import type { CatalogFile } from '../../../shared/catalog'

/** Štítky kvality (rozlišení, HDR, zvuk) z analýzy a štítky z názvu souboru. */
export default function MediaBadges({
  file,
  tags
}: {
  file: CatalogFile | undefined
  tags: string[]
}): React.JSX.Element {
  const summary = file?.summary
  // Rozlišení z názvu souboru („HD“, „1080p“) je zbytečné, když ho známe z analýzy.
  const nameTags = summary ? tags.filter((tag) => !/^(HD|SD|4K|\d{3,4}p)$/.test(tag)) : tags
  return (
    <div className="tags">
      {summary && <span className="badge hl">{summary.resolution}</span>}
      {summary?.hdr && <span className="badge hl">{summary.hdr}</span>}
      {summary?.audio && <span className="badge hl">{summary.audio}</span>}
      {nameTags.map((tag) => (
        <span key={tag} className="badge">
          {tag}
        </span>
      ))}
    </div>
  )
}
