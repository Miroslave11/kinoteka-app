import { AnimatePresence, motion } from 'motion/react'
import { HashRouter, Route, Routes, useLocation } from 'react-router'
import { AppProvider, useApp } from './app/AppContext'
import FileDetailsDialog from './components/FileDetailsDialog'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import BrowsePage from './pages/BrowsePage'
import HomePage from './pages/HomePage'
import JournalPage from './pages/JournalPage'
import MovieDetailPage from './pages/MovieDetailPage'
import SearchPage from './pages/SearchPage'
import SettingsPage from './pages/SettingsPage'
import ShowDetailPage from './pages/ShowDetailPage'

export default function App(): React.JSX.Element {
  return (
    <HashRouter>
      <AppProvider>
        <Shell />
      </AppProvider>
    </HashRouter>
  )
}

function Shell(): React.JSX.Element {
  const location = useLocation()
  const { error, setError, detailsFileId, showDetails } = useApp()

  return (
    <div className="app">
      <div className="ambient" />
      <Sidebar />
      <main className="content">
        <TopBar />
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <Routes location={location}>
              <Route path="/" element={<HomePage />} />
              <Route path="/filmy" element={<BrowsePage kind="movie" />} />
              <Route path="/filmy/:id" element={<MovieDetailPage />} />
              <Route path="/serialy" element={<BrowsePage kind="show" />} />
              <Route path="/serialy/:id" element={<ShowDetailPage />} />
              <Route path="/denik" element={<JournalPage />} />
              <Route path="/hledat" element={<SearchPage />} />
              <Route path="/nastaveni" element={<SettingsPage />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
      {detailsFileId !== null && (
        <FileDetailsDialog fileId={detailsFileId} onClose={() => showDetails(null)} />
      )}
      {error && (
        <p className="notice is-error floating" onClick={() => setError(null)}>
          {error}
        </p>
      )}
    </div>
  )
}
