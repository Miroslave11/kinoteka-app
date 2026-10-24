import { Heart } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useKids } from './KidsData'
import { TitleBubble, VideoCard } from './KidsParts'

/** Oblíbené: tituly a pohádky se srdíčkem. */
export default function KidsFavoritesPage(): React.JSX.Element {
  const { titles, videos, titleOf, play } = useKids()
  const navigate = useNavigate()
  const favoriteTitles = titles.filter((title) => title.favorite)
  const favoriteVideos = videos.filter((video) => video.favorite)

  if (favoriteTitles.length === 0 && favoriteVideos.length === 0) {
    return (
      <div className="k-empty">
        <Heart size={44} /> <br />
        Tady budou oblíbené pohádky.
        <p>Stačí v pohádce nebo u titulu zmáčknout srdíčko.</p>
      </div>
    )
  }

  return (
    <>
      <h1 className="k-hello">
        Moje <span>oblíbené</span>
      </h1>
      {favoriteTitles.length > 0 && (
        <div className="k-bubbles">
          {favoriteTitles.map((title) => (
            <TitleBubble
              key={title.id}
              title={title}
              onClick={() => navigate(`/deti/titul/${title.id}`)}
            />
          ))}
        </div>
      )}
      {favoriteVideos.length > 0 && (
        <div className="k-grid">
          {favoriteVideos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              subtitle={titleOf(video)?.name}
              progress={video.progress}
              seen={video.watched}
              onClick={() => void play(video)}
            />
          ))}
        </div>
      )}
    </>
  )
}
