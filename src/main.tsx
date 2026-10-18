import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initPwaUpdates } from './lib/pwaUpdate'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// registerType is 'prompt' (vite.config.ts): a new build is downloaded in the background, and
// UpdatePrompt offers an "Update now" card once it is waiting. See src/lib/pwaUpdate.ts for the
// timer and focus checks. App-shell/static-asset changes only, offline data still comes from Dexie.
initPwaUpdates()
