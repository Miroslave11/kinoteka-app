import '@fontsource-variable/fredoka'
import '@fontsource-variable/nunito'
import './kids.css'
import { useEffect, useState } from 'react'
import { ArrowLeft, Clock, Heart, Home, Moon, Star } from 'lucide-react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import { KidsDataProvider, useKids } from './KidsData'
import KidsFavoritesPage from './KidsFavoritesPage'
import KidsGate from './KidsGate'
import KidsHome from './KidsHome'
import KidsParent from './KidsParent'
import { ParentsButton, Rainbow } from './KidsParts'
import KidsTitlePage from './KidsTitlePage'

/** Když zbývá méně, ukáže se dítěti, kolik minut pohádek ještě zbývá. */
const SHOW_TIME_LEFT_SEC = 15 * 60

/** Dětský režim: celé okno v barevném motivu, bez menu dospělé části. */
export default function KidsApp(): React.JSX.Element {
  // Vstup do dětského režimu ho zamkne – ven už jen přes rodičovskou bránu.
  useEffect(() => void window.kinoteka.kids.enter(), [])
  return (
    <KidsDataProvider>
      <KidsShell />
    </KidsDataProvider>
  )
}

function KidsShell(): React.JSX.Element {
  const { settings, mode, limitReached, reload } = useKids()
  const location = useLocation()
  const navigate = useNavigate()
  const [gate, setGate] = useState(false)
  const home = location.pathname === '/deti'
  const parentArea = location.pathname.startsWith('/deti/rodice')
  const pill = ({ isActive }: { isActive: boolean }): string => `k-pill ${isActive ? 'on' : ''}`

  const openParents = (): void => {
    if (mode.parent) navigate('/deti/rodice')
    else setGate(true)
  }

  return (
    <div className="k-app" data-theme={settings.theme}>
      <Rainbow />
      {!parentArea && (
        <header className="k-topbar">
          {home ? (
            <div className="k-brand">
              <span className="k-logo">
                <Star size={26} fill="currentColor" strokeWidth={0} />
              </span>
              Kinotéka <small>Děti</small>
            </div>
          ) : (
            <button className="k-round" title="Zpět" onClick={() => navigate(-1)}>
              <ArrowLeft size={30} strokeWidth={2.6} />
            </button>
          )}
          <nav className="k-pills">
            <NavLink to="/deti" end className={pill}>
              <Home size={26} strokeWidth={2.4} /> Domů
            </NavLink>
            <NavLink to="/deti/oblibene" className={pill}>
              <Heart size={26} strokeWidth={2.4} /> Oblíbené
            </NavLink>
          </nav>
          {mode.timeLeftSec !== null &&
            mode.timeLeftSec > 0 &&
            mode.timeLeftSec <= SHOW_TIME_LEFT_SEC && (
              <span className="k-time-left">
                <Clock size={20} /> Ještě {Math.ceil(mode.timeLeftSec / 60)} min pohádek
              </span>
            )}
          <ParentsButton onClick={openParents} />
        </header>
      )}
      <main className="k-scroll">
        {limitReached && !parentArea ? (
          <div className="k-empty k-limit">
            <Moon size={56} fill="currentColor" strokeWidth={0} />
            <br />
            Pohádky pro dnešek skončily.
            <p>Zítra zase! (Rodiče můžou čas přidat v části Pro rodiče.)</p>
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<KidsHome />} />
            <Route path="/titul/:id" element={<KidsTitlePage />} />
            <Route path="/oblibene" element={<KidsFavoritesPage />} />
            <Route path="/rodice/*" element={<KidsParent />} />
          </Routes>
        )}
      </main>
      {gate && (
        <KidsGate
          onCancel={() => setGate(false)}
          onPass={() => {
            setGate(false)
            void reload().then(() => navigate('/deti/rodice'))
          }}
        />
      )}
    </div>
  )
}
