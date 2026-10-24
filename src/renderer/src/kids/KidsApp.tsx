import '@fontsource-variable/fredoka'
import '@fontsource-variable/nunito'
import './kids.css'
import { ArrowLeft, Heart, Home, Star } from 'lucide-react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import { KidsDataProvider, useKids } from './KidsData'
import KidsFavoritesPage from './KidsFavoritesPage'
import KidsHome from './KidsHome'
import { ParentsButton, Rainbow } from './KidsParts'
import KidsTitlePage from './KidsTitlePage'

/** Dětský režim: celé okno v barevném motivu, bez menu dospělé části. */
export default function KidsApp(): React.JSX.Element {
  return (
    <KidsDataProvider>
      <KidsShell />
    </KidsDataProvider>
  )
}

function KidsShell(): React.JSX.Element {
  const { settings } = useKids()
  const location = useLocation()
  const navigate = useNavigate()
  const home = location.pathname === '/deti'
  const pill = ({ isActive }: { isActive: boolean }): string => `k-pill ${isActive ? 'on' : ''}`

  return (
    <div className="k-app" data-theme={settings.theme}>
      <Rainbow />
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
        {/* Rodičovská brána přijde v přírůstku D5 – zatím rovnou zpět do Kinotéky. */}
        <ParentsButton onClick={() => navigate('/')} />
      </header>
      <main className="k-scroll">
        <Routes>
          <Route path="/" element={<KidsHome />} />
          <Route path="/titul/:id" element={<KidsTitlePage />} />
          <Route path="/oblibene" element={<KidsFavoritesPage />} />
        </Routes>
      </main>
    </div>
  )
}
