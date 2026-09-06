import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { configureClient } from './api/client'
import { clearSession, sessionToken } from './features/auth/session'
import './index.css'

configureClient({ token: sessionToken, onUnauthorized: clearSession })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
