import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Status } from './types'

export function StatusBadge({ status }: { status: Status }) {
  const cls = status === 'Healthy' ? 'healthy' : status === 'Watch' ? 'watch' : 'risk'
  return <span className={`badge ${cls}`}>{status}</span>
}

export function SimBadge({ label = 'Simulated' }: { label?: string }) {
  return <span className="badge sim">◆ {label}</span>
}

export function Drawer({ title, subtitle, onClose, children, footer, wide }: {
  title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className={`drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="dhead">
          <div>
            <h2>{title}</h2>
            {subtitle && <div style={{ marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="dbody">{children}</div>
        {footer && <div className="dfoot">{footer}</div>}
      </aside>
    </>
  )
}

export interface LoadStep { label: string }
export function LoadingSteps({ steps, done }: { steps: string[]; done: number }) {
  return (
    <div className="loading-steps">
      {steps.map((s, i) => (
        <div key={s} className={`lstep ${i < done ? 'done' : i === done ? 'active' : ''}`}>
          <span className="mark">{i < done ? '✓' : i === done ? <span className="spinner" /> : ''}</span>
          {s}
        </div>
      ))}
    </div>
  )
}

// animate a number toward its target when it changes (KPI count-up)
export function useCountUp(target: number, ms = 650) {
  const [val, setVal] = useState(target)
  const fromRef = useRef(target)
  useEffect(() => {
    const from = fromRef.current
    if (from === target) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      const eased = 1 - Math.pow(1 - t, 3)
      setVal(from + (target - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else { fromRef.current = target; setVal(target) }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return val
}

export function AnimatedNumber({ value, suffix = '', decimals = 0 }: { value: number; suffix?: string; decimals?: number }) {
  const v = useCountUp(value)
  return <>{v.toFixed(decimals)}{suffix}</>
}

// runs a stepped choreography, calls onComplete after finishing
export function useChoreography(steps: string[], running: boolean, onComplete: () => void) {
  const [done, setDone] = useState(0)
  useEffect(() => {
    if (!running) { setDone(0); return }
    let cancelled = false
    setDone(0)
    const per = Math.max(350, Math.min(600, 1400 / steps.length))
    let i = 0
    const tick = () => {
      if (cancelled) return
      i++
      setDone(i)
      if (i < steps.length) setTimeout(tick, per)
      else setTimeout(() => { if (!cancelled) onComplete() }, 300)
    }
    const t = setTimeout(tick, per)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])
  return done
}
