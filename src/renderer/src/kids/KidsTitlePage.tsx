import { Heart, Play } from 'lucide-react'
import { useParams } from 'react-router'
import type { KidsVideo } from '../../../shared/kids'
import { countOf } from '../../../shared/plural'
import { useKids } from './KidsData'
import { imageStyle, VideoCard } from './KidsParts'

/** Kterou pohádku pustí velké tlačítko: rozkoukanou, jinak první neviděnou, jinak první. */
export function startVideo(videos: KidsVideo[]): KidsVideo | undefined {
  return (
    videos.find((video) => video.progress !== null) ??
    videos.find((video) => !video.watched) ??
    videos[0]
  )
}

/** Detail titulu: velký obrázek, název, srdíčko a všechny pohádky jako velké karty. */
export default function KidsTitlePage(): React.JSX.Element {
  const { id } = useParams()
  const { titles, loading, play } = useKids()
  const title = titles.find((t) => String(t.id ?? 'ostatni') === id)

  if (!title) {
    return <div className="k-empty">{loading ? 'Načítám…' : 'Tenhle titul už tu není.'}</div>
  }

  const start = startVideo(title.videos)
  const seen = title.videos.filter((video) => video.watched).length

  return (
    <>
      <div className="k-title-head">
        <span className="k-face" style={imageStyle(title.coverUrl, title.name)} />
        <div>
          <h1 className="k-title-name">{title.name}</h1>
          <div className="k-title-sub">
            {countOf(title.videos.length, 'pohádka', 'pohádky', 'pohádek')}
            {seen > 0 && ` · ${seen} už viděno`}
          </div>
          <div className="k-head-actions">
            {start && (
              <button className="k-big-btn" onClick={() => void play(start)}>
                <Play size={30} fill="currentColor" strokeWidth={0} />
                {start.progress !== null ? `Pokračovat: ${start.name}` : 'Přehrát'}
              </button>
            )}
            {title.id !== null && (
              <button
                className={`k-round k-heart ${title.favorite ? 'is-on' : ''}`}
                title={title.favorite ? 'Oblíbený' : 'Přidat do oblíbených'}
                onClick={() =>
                  void window.kinoteka.kids.setFavorite('title', title.id!, !title.favorite)
                }
              >
                <Heart
                  size={30}
                  fill={title.favorite ? 'currentColor' : 'none'}
                  strokeWidth={2.6}
                />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="k-grid">
        {title.videos.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            progress={video.progress}
            seen={video.watched}
            onClick={() => void play(video)}
          />
        ))}
      </div>
    </>
  )
}
