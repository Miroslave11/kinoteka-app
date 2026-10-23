import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useApp } from '../app/AppContext'
import { addedAt, continueWatching, type TitleItem } from '../app/catalogData'
import { applyPalette, titlePalette, useAmbientPalette } from '../app/palette'
import ContinueCard from '../components/ContinueCard'
import Hero from '../components/Hero'
import Poster from '../components/Poster'

const HERO_COUNT = 5
const HERO_INTERVAL_MS = 8000

export default function HomePage(): React.JSX.Element {
  const { titles, movies, shows, loading } = useApp()
  const [heroIndex, setHeroIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  const recent = useMemo(
    () => [...titles].sort((a, b) => addedAt(b).localeCompare(addedAt(a))),
    [titles]
  )
  const continuing = useMemo(() => continueWatching(titles), [titles])
  const heroTitles = recent.slice(0, HERO_COUNT)
  const heroTitle = heroTitles[heroIndex % Math.max(1, heroTitles.length)]
  useAmbientPalette(heroTitle ? titlePalette(heroTitle) : null)
  const restorePalette = (): void => {
    setPaused(false)
    if (heroTitle) applyPalette(titlePalette(heroTitle))
  }

  useEffect(() => {
    if (paused || heroTitles.length < 2) return
    const timer = window.setInterval(
      () => setHeroIndex((index) => (index + 1) % heroTitles.length),
      HERO_INTERVAL_MS
    )
    return () => window.clearInterval(timer)
  }, [paused, heroTitles.length])

  if (!loading && titles.length === 0) {
    return (
      <div className="page empty-home">
        <h1>Vítej v Kinotéce</h1>
        <p className="subtitle">Zatím tu nic není. Přidej složku s filmy nebo seriály.</p>
        <Link className="btn primary" to="/nastaveni">
          Přidat složku
        </Link>
      </div>
    )
  }

  const row = (heading: string, items: TitleItem[], link?: string): React.JSX.Element | null =>
    items.length === 0 ? null : (
      <section className="row">
        <h3>
          {heading}
          {link && (
            <Link to={link} className="row-link">
              Zobrazit vše
            </Link>
          )}
        </h3>
        <div className="strip">
          {items.map((title) => (
            <Poster
              key={`${title.kind}-${title.id}`}
              title={title}
              tintOnHover
              onHoverEnd={restorePalette}
            />
          ))}
        </div>
      </section>
    )

  return (
    <div className="home">
      <Hero
        titles={heroTitles}
        index={heroIndex % Math.max(1, heroTitles.length)}
        onSelect={setHeroIndex}
      />
      <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        {continuing.length > 0 && (
          <section className="row">
            <h3>Pokračovat ve sledování</h3>
            <div className="strip">
              {continuing.map((item) => (
                <ContinueCard key={item.key} item={item} onHoverEnd={restorePalette} />
              ))}
            </div>
          </section>
        )}
        {row('Nově přidané', recent.slice(0, 20))}
        {row(
          'Filmy',
          titles
            .filter((t) => t.kind === 'movie')
            .sort((a, b) => a.name.localeCompare(b.name, 'cs')),
          movies.length > 0 ? '/filmy' : undefined
        )}
        {row(
          'Seriály',
          titles
            .filter((t) => t.kind === 'show')
            .sort((a, b) => a.name.localeCompare(b.name, 'cs')),
          shows.length > 0 ? '/serialy' : undefined
        )}
      </div>
    </div>
  )
}
