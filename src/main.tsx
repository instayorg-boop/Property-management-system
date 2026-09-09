import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// autoUpdate: a new SW takes over silently on the next load rather than prompting managers
// mid-session — app-shell/static-asset changes only, offline data still comes from Dexie.
if ('serviceWorker' in navigator) {
  registerSW({ immediate: true })
}
