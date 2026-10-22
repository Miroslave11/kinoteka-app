import { useState } from 'react'

/** Obrázek z TMDB; když chybí nebo se nenačte, zůstane vidět zástupné pozadí pod ním. */
export default function Artwork({
  src,
  className,
  alt = ''
}: {
  src: string | null | undefined
  className?: string
  alt?: string
}): React.JSX.Element | null {
  const [failed, setFailed] = useState<string | null>(null)
  if (!src || failed === src) return null
  return (
    <img
      className={`artwork ${className ?? ''}`}
      src={src}
      alt={alt}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(src)}
    />
  )
}
