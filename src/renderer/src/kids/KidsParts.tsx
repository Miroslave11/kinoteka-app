import { Lock, Play, Star } from 'lucide-react'
import type { KidsTitle, KidsVideo } from '../../../shared/kids'

/** Pastelový zástupný přechod, když video nebo titul nemá obrázek. */
function pastel(name: string): React.CSSProperties {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return {
    background: `radial-gradient(70% 60% at 50% 40%, hsl(${hash} 90% 88%), hsl(${(hash + 40) % 360} 85% 74%))`
  }
}

export const imageStyle = (url: string | null, name: string): React.CSSProperties =>
  url ? { backgroundImage: `url("${url}")` } : pastel(name)

/** „5 min“, „1 h 2 min“ – dětem stačí minuty. */
export function minutes(seconds: number | null): string | null {
  if (seconds === null) return null
  const total = Math.max(1, Math.round(seconds / 60))
  return total >= 60 ? `${Math.floor(total / 60)} h ${total % 60} min` : `${total} min`
}

export function TitleBubble({
  title,
  onClick
}: {
  title: KidsTitle
  onClick: () => void
}): React.JSX.Element {
  return (
    <button className="k-bubble" onClick={onClick}>
      <span className="k-face" style={imageStyle(title.coverUrl, title.name)} />
      <b>{title.name}</b>
    </button>
  )
}

export function VideoCard({
  video,
  subtitle,
  big,
  progress,
  seen,
  onClick
}: {
  video: KidsVideo
  subtitle?: string
  big?: boolean
  /** 0–1 u rozkoukané pohádky. */
  progress?: number | null
  seen?: boolean
  onClick: () => void
}): React.JSX.Element {
  const time = minutes(video.durationSec)
  return (
    <button className={`k-card ${big ? 'big' : ''}`} onClick={onClick} title={video.originalName}>
      <span className="k-thumb" style={imageStyle(video.thumbnailUrl, video.name)}>
        {time && <span className="k-time">{time}</span>}
        {seen && (
          <span className="k-seen" title="Už viděno">
            <Star size={20} fill="currentColor" strokeWidth={0} />
          </span>
        )}
        {progress != null && progress > 0 && (
          <span className="k-bar">
            <i style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </span>
        )}
        <span className="k-play-dot">
          <Play size={28} fill="currentColor" strokeWidth={0} style={{ marginLeft: 4 }} />
        </span>
      </span>
      <b>{video.name}</b>
      {subtitle && <small>{subtitle}</small>}
    </button>
  )
}

export function ParentsButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button className="k-parents" onClick={onClick}>
      <Lock size={18} /> Pro rodiče
    </button>
  )
}

/** Duha v pozadí motivu Jednorožci. */
export function Rainbow(): React.JSX.Element {
  const colors = ['#ff6b8a', '#ffb547', '#ffe066', '#6ee7a8', '#6cc8ff', '#b28cff']
  return (
    <svg className="k-rainbow" viewBox="0 0 520 280" aria-hidden="true">
      <g fill="none" strokeWidth="22" strokeLinecap="round">
        {colors.map((color, i) => (
          <path
            key={color}
            d={`M${30 + i * 22} 270 A${230 - i * 22} ${230 - i * 22} 0 0 1 ${490 - i * 22} 270`}
            stroke={color}
          />
        ))}
      </g>
    </svg>
  )
}

/** Kreslený jednorožec – maskot motivu Jednorožci na Domů (vlastní kresba). */
export function Mascot(): React.JSX.Element {
  const mane = ['#ff6b8a', '#ffb547', '#ffe066', '#6ee7a8', '#6cc8ff', '#b28cff']
  return (
    <svg className="k-mascot" viewBox="40 0 480 330" aria-hidden="true">
      <defs>
        <linearGradient id="k-u-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbf6ff" />
          <stop offset=".55" stopColor="#e9dcff" />
          <stop offset="1" stopColor="#cdb6f7" />
        </linearGradient>
        <linearGradient id="k-u-horn" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#f3b63a" />
          <stop offset="1" stopColor="#ffe9a3" />
        </linearGradient>
        <linearGradient id="k-u-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset=".72" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id="k-u-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="520" height="330">
          <rect width="520" height="330" fill="url(#k-u-fade)" />
        </mask>
      </defs>
      <g mask="url(#k-u-mask)">
        <g fill="none" strokeLinecap="round" strokeWidth="30">
          {mane.map((color, i) => (
            <path
              key={color}
              d={`M${300 + i * 6} ${150 + i * 42} C ${380 + i * 5} ${150 + i * 47} ${430 + i * 5} ${210 + i * 49} 520 ${205 + i * 55}`}
              stroke={color}
            />
          ))}
        </g>
        <path
          d="M290 620 C 285 520 270 440 240 380 C 215 330 175 300 140 285 C 100 268 70 252 64 228 C 58 202 80 186 112 180 C 140 175 165 170 182 160 C 196 128 214 108 240 98 C 290 80 336 108 352 160 C 372 225 380 330 400 470 C 410 540 420 590 430 620 Z"
          fill="url(#k-u-body)"
        />
        <ellipse cx="96" cy="222" rx="38" ry="30" fill="#f6eaff" />
        <ellipse cx="82" cy="216" rx="7" ry="5" fill="#b89ad8" />
        <path
          d="M78 246 q22 12 44 2"
          stroke="#b89ad8"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M262 104 L 282 40 L 300 112 Z" fill="#e9dcff" />
        <path d="M270 100 L 283 58 L 293 104 Z" fill="#ffc6e0" />
        <path d="M222 104 L 236 8 L 254 98 Z" fill="url(#k-u-horn)" />
        <g stroke="#e0a12a" strokeWidth="3" strokeLinecap="round">
          <path d="M226 88 L 251 80" />
          <path d="M229 66 L 248 58" />
          <path d="M232 44 L 245 38" />
        </g>
        <ellipse cx="200" cy="168" rx="20" ry="24" fill="#2b2147" />
        <circle cx="207" cy="159" r="7" fill="#fff" />
        <circle cx="194" cy="178" r="3" fill="#fff" opacity=".8" />
        <path
          d="M182 146 l-8 -10 M192 142 l-4 -12 M204 141 l0 -12"
          stroke="#2b2147"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <ellipse cx="160" cy="222" rx="18" ry="11" fill="#ff9fc8" opacity=".55" />
        <path
          d="M250 102 C 232 120 226 140 232 160"
          stroke="#ff6b8a"
          strokeWidth="16"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M266 104 C 252 126 250 148 258 168"
          stroke="#b28cff"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
