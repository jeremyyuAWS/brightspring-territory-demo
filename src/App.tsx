import { useEffect, useState } from 'react'
import { useStore, actions, type TabKey } from './store'
import { Home } from './views/Home'
import { Plan } from './views/Plan'
import { Today } from './views/Today'
import { Accounts } from './views/Accounts'
import { DataSimPanel } from './components/DataSimPanel'
import { Assistant } from './assistant/Assistant'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'plan', label: 'Plan' },
  { key: 'today', label: 'Today' },
  { key: 'accounts', label: 'Accounts' },
]

// Faithful inline recreation of the BrightSpring Health Services logo (self-contained, no external asset)
function BrandLogo() {
  return (
    <span className="bs-logo" aria-label="BrightSpring Health Services">
      <svg viewBox="0 0 100 80" role="img" aria-hidden="true">
        <path d="M50 5 L96 75 L71 75 L50 33 L29 75 L4 75 Z" fill="#1b5aa8" strokeLinejoin="round" />
      </svg>
      <span className="bs-text">
        <span className="bs-word">BrightSpring<sup>®</sup></span>
        <span className="bs-sub">Health Services</span>
      </span>
    </span>
  )
}

export default function App() {
  const s = useStore()
  const [showReset, setShowReset] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <BrandLogo />
          <span className="bs-divider" />
          <span className="bs-market">Territory Command Center<b>Adoration Health · Richmond</b></span>
        </div>
        <nav className="nav">
          {TABS.map(t => (
            <button key={t.key} className={s.tab === t.key ? 'active' : ''} onClick={() => actions.setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <span className="env-pill"><span className="dot" /> Demo · Synthetic Data</span>
        <button className="top-btn ai" onClick={() => actions.toggleAssistant(true)}>◇ Ask Copilot</button>
        <button className="top-btn" onClick={() => setShowInfo(true)}>Data &amp; Simulation</button>
        <button className="top-btn" onClick={() => { if (actions.hasChanges()) setShowReset(true); else actions.reset() }}>↺ Reset demo</button>
      </header>

      <main className="main">
        {s.tab === 'home' && <Home />}
        {s.tab === 'plan' && <Plan />}
        {s.tab === 'today' && <Today />}
        {s.tab === 'accounts' && <Accounts />}
      </main>

      <ToastHost />

      {showReset && (
        <>
          <div className="scrim" onClick={() => setShowReset(false)} />
          <div className="drawer" style={{ width: 420, height: 'auto', top: '30%', borderRadius: 14, right: '50%', transform: 'translateX(50%)' }}>
            <div className="dhead"><h2>Reset demo?</h2><button className="iconbtn" onClick={() => setShowReset(false)}>×</button></div>
            <div className="dbody">
              This restores the seeded baseline (seed-v1): all assignments, plans, referral dispositions, and audit history are cleared.
            </div>
            <div className="dfoot">
              <button className="btn" onClick={() => setShowReset(false)}>Cancel</button>
              <button className="btn primary" onClick={() => { actions.reset(); setShowReset(false) }}>Reset to baseline</button>
            </div>
          </div>
        </>
      )}

      {showInfo && <DataSimPanel onClose={() => setShowInfo(false)} />}
      <Assistant />
    </div>
  )
}

function ToastHost() {
  const s = useStore()
  const toasts: React.ReactNode[] = []
  if (s.snapshotReady) {
    toasts.push(
      <div className="toast" key="snap">
        <span>◆</span>
        <span className="grow"><b>Leadership snapshot ready</b> — simulated export generated.</span>
        <button className="tbtn" onClick={() => actions.exportSnapshotDownload()}>Download</button>
        <button className="tbtn" onClick={() => actions.clearSnapshot()}>Dismiss</button>
      </div>,
    )
  }
  if (s.undoLabel) toasts.push(<UndoToast key="undo" label={s.undoLabel} />)
  if (!toasts.length) return null
  return <div className="toast-wrap">{toasts}</div>
}

// Big toast for ~5s, then collapse to a compact applied-state pill so it stops covering
// the scorecard / referral content while the undo action stays reachable.
function UndoToast({ label }: { label: string }) {
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    setCollapsed(false)
    const t = setTimeout(() => setCollapsed(true), 5000)
    return () => clearTimeout(t)
  }, [label])
  if (collapsed) {
    return (
      <div className="toast toast-compact">
        <span className="dot" />
        <span className="grow">Simulation applied</span>
        <button className="tbtn" onClick={() => actions.undo()}>{label}</button>
      </div>
    )
  }
  return (
    <div className="toast">
      <span>◆</span>
      <span className="grow">Simulation applied. You can reverse the last action.</span>
      <button className="tbtn" onClick={() => actions.undo()}>{label}</button>
    </div>
  )
}
