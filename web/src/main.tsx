import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { configureClient } from './api/client'
import { onUnauthorized } from './features/auth/auth'
import { sessionToken } from './features/auth/session'
import './index.css'

configureClient({ token: sessionToken, onUnauthorized })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
