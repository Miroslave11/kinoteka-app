import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PlayerOverlay from './PlayerOverlay'
import './overlay.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlayerOverlay />
  </StrictMode>
)
