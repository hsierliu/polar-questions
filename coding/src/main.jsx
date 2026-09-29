import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

const root = ReactDOM.createRoot(document.getElementById('root'))

root.render(
  <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'sans-serif' }}>
    Loading…
  </div>,
)

import('./App.jsx')
  .then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    )
  })
  .catch((error) => {
    console.error('Application startup failed:', error)
    root.render(
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', fontFamily: 'sans-serif', background: '#f3f4f6' }}>
        <div style={{ maxWidth: '640px', padding: '32px', background: 'white', border: '1px solid #fca5a5', borderRadius: '12px' }}>
          <h1 style={{ color: '#b91c1c', marginTop: 0 }}>Application startup failed</h1>
          <p style={{ color: '#374151' }}>{error?.message || 'Unknown startup error'}</p>
        </div>
      </div>,
    )
  })
