import { Play } from 'lucide-react'
import { useParams } from 'react-router'
import { countOf } from '../../../shared/plural'
import { useKids } from './KidsData'
import { imageStyle, VideoCard } from './KidsParts'

/** Detail titulu: velký obrázek, název a všechny pohádky jako velké karty. */
export default function KidsTitlePage(): React.JSX.Element {
  const { id } = useParams()
  const { titles, loading, play } = useKids()
  const title = titles.find((t) => String(t.id ?? 'ostatni') === id)

  if (!title) {
    return <div className="k-empty">{loading ? 'Načítám…' : 'Tenhle titul už tu není.'}</div>
  }

  const first = title.videos.at(-1) ?? title.videos[0]

  return (
    <>
      <div className="k-title-head">
        <span className="k-face" style={imageStyle(title.coverUrl, title.name)} />
        <div>
          <h1 className="k-title-name">{title.name}</h1>
          <div className="k-title-sub">
            {countOf(title.videos.length, 'pohádka', 'pohádky', 'pohádek')}
          </div>
          {first && (
            <div className="k-head-actions">
              <button className="k-big-btn" onClick={() => void play(first)}>
                <Play size={30} fill="currentColor" strokeWidth={0} /> Přehrát
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="k-grid">
        {title.videos.map((video) => (
          <VideoCard key={video.id} video={video} onClick={() => void play(video)} />
        ))}
      </div>
    </>
  )
}
