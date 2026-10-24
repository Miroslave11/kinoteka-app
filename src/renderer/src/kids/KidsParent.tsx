import { Download, Home, List, Lock } from 'lucide-react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router'
import { useKids } from './KidsData'
import KidsParentDownload from './KidsParentDownload'
import KidsParentTitles from './KidsParentTitles'

/**
 * Část Pro rodiče (za rodičovskou branou): stahování a správa titulů. Nastavení dětské
 * části je v hlavním Nastavení → Děti.
 * Bez otevřené brány přesměruje zpět k pohádkám.
 */
export default function KidsParent(): React.JSX.Element {
  const { mode, loading } = useKids()
  const navigate = useNavigate()
  const { kids } = window.kinoteka

  if (!loading && mode.locked && !mode.parent) return <Navigate to="/deti" replace />

  const tab = ({ isActive }: { isActive: boolean }): string => (isActive ? 'on' : '')

  return (
    <div className="k-parent">
      <header className="k-ptop">
        <h2>
          <Lock size={28} /> Pro rodiče
        </h2>
        <nav className="k-tabs">
          <NavLink to="/deti/rodice/stahovani" className={tab}>
            <Download size={18} /> Stáhnout z YouTube
          </NavLink>
          <NavLink to="/deti/rodice/tituly" className={tab}>
            <List size={18} /> Tituly
          </NavLink>
        </nav>
        <div className="k-ptop-right">
          <button
            className="k-btn primary"
            onClick={() => void kids.leaveParent().then(() => navigate('/deti'))}
          >
            <Home size={18} /> Zpět k pohádkám
          </button>
          <button
            className="k-btn"
            onClick={() =>
              void kids.exit().then((done) => {
                if (done) navigate('/')
              })
            }
          >
            Odejít z dětského režimu
          </button>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Navigate to="stahovani" replace />} />
        <Route path="/stahovani" element={<KidsParentDownload />} />
        <Route path="/tituly" element={<KidsParentTitles />} />
      </Routes>
    </div>
  )
}
