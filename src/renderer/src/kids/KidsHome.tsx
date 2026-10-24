import { CirclePlay, Heart, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router'
import type { KidsVideo } from '../../../shared/kids'
import { useKids } from './KidsData'
import { Mascot, TitleBubble, VideoCard } from './KidsParts'

const NEW_COUNT = 12
const CONTINUE_COUNT = 6

/** Dětská obrazovka Domů: kulaté tituly, rozkoukané, oblíbené a nejnovější pohádky. */
export default function KidsHome(): React.JSX.Element {
  const { titles, videos, loading, titleOf, play } = useKids()
  const navigate = useNavigate()

  if (!loading && videos.length === 0) {
    return (
      <div className="k-empty">
        Zatím tu nejsou žádné pohádky.
        <p>Rodiče je můžou stáhnout v části „Pro rodiče“.</p>
      </div>
    )
  }

  const continuing = videos
    .filter((video) => video.progress !== null)
    .sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''))
    .slice(0, CONTINUE_COUNT)
  const favorites = videos.filter((video) => video.favorite)
  const card = (video: KidsVideo, big = false): React.JSX.Element => (
    <VideoCard
      key={video.id}
      video={video}
      big={big}
      subtitle={titleOf(video)?.name}
      progress={video.progress}
      seen={video.watched}
      onClick={() => void play(video)}
    />
  )

  return (
    <>
      <Mascot />
      <h1 className="k-hello">
        Na co se <span>podíváme?</span>
      </h1>
      <div className="k-bubbles">
        {titles.map((title) => (
          <TitleBubble
            key={title.id ?? 'ostatni'}
            title={title}
            onClick={() => navigate(`/deti/titul/${title.id ?? 'ostatni'}`)}
          />
        ))}
      </div>
      {continuing.length > 0 && (
        <>
          <h2 className="k-row-h">
            <CirclePlay size={28} /> Dívat se dál
          </h2>
          <div className="k-strip">{continuing.map((video) => card(video, true))}</div>
        </>
      )}
      {favorites.length > 0 && (
        <>
          <h2 className="k-row-h">
            <Heart size={28} /> Oblíbené
          </h2>
          <div className="k-strip">{favorites.map((video) => card(video))}</div>
        </>
      )}
      <h2 className="k-row-h">
        <Sparkles size={28} /> Nové pohádky
      </h2>
      <div className="k-strip">{videos.slice(0, NEW_COUNT).map((video) => card(video))}</div>
    </>
  )
}
