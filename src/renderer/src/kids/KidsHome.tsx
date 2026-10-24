import { Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useKids } from './KidsData'
import { Mascot, TitleBubble, VideoCard } from './KidsParts'

const NEW_COUNT = 12

/** Dětská obrazovka Domů: kulaté tituly a nejnovější pohádky. */
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
      <h2 className="k-row-h">
        <Sparkles size={28} /> Nové pohádky
      </h2>
      <div className="k-strip">
        {videos.slice(0, NEW_COUNT).map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            subtitle={titleOf(video)?.name}
            onClick={() => void play(video)}
          />
        ))}
      </div>
    </>
  )
}
