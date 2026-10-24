import { useState } from 'react'
import { CalendarClock, Check, CircleCheck, Info, Play, Trash2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { airDateText, localDate, upcomingOf, upcomingText } from '../../../shared/airing'
import { canResume, episodeCode, progressRatio, remainingText } from '../../../shared/playback'
import { formatTime } from '../../../shared/player'
import { useApp } from '../app/AppContext'
import {
  displayName,
  mergeSeasons,
  playableFile,
  showFiles,
  upNext,
  watchedTitle,
  type EpisodeView,
  type TitleItem
} from '../app/catalogData'
import { placeholderStyle, titlePalette, useAmbientPalette } from '../app/palette'
import Artwork from '../components/Artwork'
import DetailHeader from '../components/DetailHeader'
import DeleteDialog from '../components/DeleteDialog'
import MediaBadges from '../components/MediaBadges'
import WatchedDialog from '../components/WatchedDialog'
import { countOf } from '../../../shared/plural'

export default function ShowDetailPage(): React.JSX.Element {
  const { id } = useParams()
  const { shows, loading, play } = useApp()
  const show = shows.find((s) => s.id === Number(id))
  const [seasonNumber, setSeasonNumber] = useState<number | null>(null)
  const [marking, setMarking] = useState(false)
  const [deleting, setDeleting] = useState<{ heading: string; fileIds: number[] } | null>(null)
  const askDelete = (heading: string, fileIds: number[]): void => setDeleting({ heading, fileIds })
  const navigate = useNavigate()
  useAmbientPalette(show ? titlePalette(show) : null)

  if (!show) {
    return (
      <div className="page">
        <p className="empty">{loading ? 'Načítám…' : 'Seriál už v knihovně není.'}</p>
      </div>
    )
  }

  const title: TitleItem = { kind: 'show', ...show }
  const seasons = mergeSeasons(show)
  // Výchozí série = první, ve které je něco na disku.
  const season =
    seasons.find((s) => s.number === seasonNumber) ??
    seasons.find((s) => s.episodes.some((e) => e.disk)) ??
    seasons[0]
  const next = upNext(show)
  const nextCode = next && episodeCode(next.episode.season, next.episode.episode)
  const tags = [...new Set(showFiles(show).flatMap((f) => f.tags))]
  const total = seasons.reduce((sum, s) => sum + s.episodes.length, 0)
  // Série jako zhlédnutá = dosud nezhlédnuté díly na disku (když jsou všechny zhlédnuté, znovu všechny).
  const onDisk = (season?.episodes ?? []).flatMap((e) => (e.disk ? [e.disk] : []))
  const unwatched = onDisk.filter((e) => e.watch.watchCount === 0)
  const seasonEpisodes = (unwatched.length > 0 ? unwatched : onDisk).map((e) => e.id)
  const today = localDate()
  const upcoming = upcomingOf(show.metadata, today)

  return (
    <div className="detail-page">
      <DetailHeader
        title={title}
        meta={[
          countOf(seasons.length, 'série', 'série', 'sérií'),
          show.metadata
            ? `${show.episodeCount} z ${total} dílů na disku`
            : `${countOf(show.episodeCount, 'díl', 'díly', 'dílů')} na disku`
        ]}
        badges={<MediaBadges file={undefined} tags={tags} />}
      >
        {next && (
          <button
            className="btn primary"
            onClick={() => void play(next.file.id, next.mode === 'resume' ? 'resume' : undefined)}
          >
            <Play size={18} fill="currentColor" />
            {next.mode === 'resume'
              ? `Pokračovat ${nextCode}`
              : next.mode === 'next'
                ? `Další díl: ${nextCode}`
                : `Přehrát ${nextCode}`}
          </button>
        )}
      </DetailHeader>

      {show.alternativeNames.length > 0 && (
        <p className="d-section info-chip">
          Soubory seskupené z různých názvů: {[show.name, ...show.alternativeNames].join(' / ')}
        </p>
      )}

      {upcoming && (
        <p className="d-section info-chip airing">
          <CalendarClock size={15} /> {upcomingText(upcoming, today)}
        </p>
      )}

      <section className="d-section">
        <div className="seasons">
          {seasons.map((s) => (
            <button
              key={s.number}
              className={`chip ${s.number === season?.number ? 'on' : ''}`}
              onClick={() => setSeasonNumber(s.number)}
            >
              {s.name}
              <span className="chip-count">
                {s.episodes.filter((e) => e.disk).length}/{s.episodes.length}
              </span>
            </button>
          ))}
          {seasonEpisodes.length > 0 && (
            <button className="btn sm season-watched" onClick={() => setMarking(true)}>
              <CircleCheck size={16} /> Označit sérii jako zhlédnutou
            </button>
          )}
          {onDisk.length > 0 && season && (
            <button
              className="btn sm"
              title="Smazat z disku všechny díly této série"
              onClick={() =>
                askDelete(
                  `Smazat ${season.name.toLowerCase()} seriálu „${displayName(title)}“?`,
                  onDisk.flatMap((e) => e.files.map((f) => f.id))
                )
              }
            >
              <Trash2 size={16} /> Smazat sérii
            </button>
          )}
        </div>
        {season?.episodes.map((episode) => (
          <EpisodeRow
            key={`${episode.season}x${episode.episode}`}
            titleId={show.id}
            showName={show.name}
            today={today}
            onDelete={(fileIds) =>
              askDelete(
                `Smazat díl ${episodeCode(episode.season, episode.episode)}${episode.name ? ` „${episode.name}“` : ''}?`,
                fileIds
              )
            }
            episode={episode}
          />
        ))}
      </section>
      {deleting && (
        <DeleteDialog
          heading={deleting.heading}
          fileIds={deleting.fileIds}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            // Smazal se celý seriál → zpět na seznam seriálů.
            if (deleting.fileIds.length >= showFiles(show).length) navigate('/serialy')
          }}
        />
      )}
      {marking && season && (
        <WatchedDialog
          target={{
            titleId: show.id,
            episodeIds: seasonEpisodes,
            label: `${displayName(title)} · ${season.name}`
          }}
          onClose={() => setMarking(false)}
        />
      )}
    </div>
  )
}

function EpisodeRow({
  titleId,
  showName,
  today,
  episode,
  onDelete
}: {
  titleId: number
  showName: string
  today: string
  episode: EpisodeView
  onDelete: (fileIds: number[]) => void
}): React.JSX.Element {
  const { play, showDetails } = useApp()
  const files = episode.disk?.files ?? []
  const file = playableFile(files)
  const first = file ?? files[0]
  const watch = episode.disk?.watch
  const progress = watch && canResume(watch.progress) ? watch.progress : null
  const airsLater = !episode.disk && episode.airDate !== null && episode.airDate >= today

  return (
    <div
      className={`ep ${episode.disk ? (file ? '' : 'is-unavailable') : `is-missing ${airsLater ? 'is-upcoming' : ''}`}`}
    >
      <button
        className="ep-still"
        style={placeholderStyle(`${showName} ${episode.season}x${episode.episode}`)}
        disabled={!file}
        onClick={() => file && void play(file.id)}
        title={file ? 'Přehrát' : episode.disk ? 'Soubor není dostupný' : 'Díl není na disku'}
      >
        <Artwork src={episode.stillUrl} />
        {file && (
          <span className="ep-play">
            <Play size={20} fill="currentColor" />
          </span>
        )}
        {progress && (
          <span className="progress-bar on-image">
            <i style={{ width: `${progressRatio(progress) * 100}%` }} />
          </span>
        )}
      </button>
      <div className="ep-info">
        <h5>
          {episode.episode}. {episode.name ?? 'díl'}
        </h5>
        {episode.overview && <p className="ep-overview">{episode.overview}</p>}
        {episode.disk ? (
          <>
            <MediaBadges file={first} tags={first?.tags ?? []} />
            <small className="mono">{files.map((f) => f.fileName).join(' · ')}</small>
          </>
        ) : airsLater && episode.airDate ? (
          <small className="accent">Vyjde {airDateText(episode.airDate, today)}</small>
        ) : (
          <small>Tento díl na disku není.</small>
        )}
      </div>
      <div className="ep-side">
        {first?.summary && <span>{formatTime(first.summary.durationSec)}</span>}
        {progress && <span className="accent">{remainingText(progress)}</span>}
        {watch && watch.watchCount > 0 ? (
          <span className="ok-dot" title={watchedTitle(watch)}>
            <Check size={15} strokeWidth={3} />
          </span>
        ) : (
          episode.disk && (
            <button
              className="icon-btn xs"
              title="Označit jako zhlédnuté (zapíše se do deníku s dnešním datem)"
              onClick={() =>
                void window.kinoteka.journal.addManual({
                  titleId,
                  episodeIds: [episode.disk!.id],
                  watchedAt: new Date().toISOString(),
                  note: null
                })
              }
            >
              <CircleCheck size={15} />
            </button>
          )
        )}
        {first && (
          <button
            className="icon-btn xs"
            onClick={() => showDetails(first.id)}
            title="Vlastnosti souboru"
          >
            <Info size={14} />
          </button>
        )}
        {files.length > 0 && (
          <button
            className="icon-btn xs"
            onClick={() => onDelete(files.map((f) => f.id))}
            title="Smazat díl z disku"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
