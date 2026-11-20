import { useEffect, useMemo, useState } from 'react'
import {
  advanceDays,
  attachMpPdf,
  attachRpPdf,
  changeMpStatus,
  changeRpStatus,
  fmtDate,
  rpCode,
  runSlaJob,
  scheduleInterview,
  seed,
  submitPersonnelChange,
  submitStaffingRequest,
  type NewChange,
  type NewRequest,
} from './logic'
import {
  CHANGE_TYPES,
  INTERVIEW_STEPS,
  MANAGERS,
  MP_STATUSES,
  RP_STATUSES,
  type AppState,
  type Email,
  type InterviewStep,
  type Manager,
  type PersonnelChange,
  type StaffingRequest,
} from './types'

const STORAGE_KEY = 'hr-automation-demo-v1'
const todayIso = () => new Date().toISOString().slice(0, 10)

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as AppState
  } catch {
    /* storage unavailable: start fresh */
  }
  return seed(todayIso())
}

type Role = 'manager' | 'hr'
type Doc = { kind: 'rp'; item: StaffingRequest } | { kind: 'mp'; item: PersonnelChange }

export default function App() {
  const [state, setState] = useState<AppState>(load)
  const [role, setRole] = useState<Role>('hr')
  const [manager, setManager] = useState<Manager>(MANAGERS[0])
  const [side, setSide] = useState<'outbox' | 'runs'>('outbox')
  const [openMail, setOpenMail] = useState<Email | null>(null)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [interviewFor, setInterviewFor] = useState<StaffingRequest | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }, [state])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const apply = (fn: (s: AppState) => AppState, message?: string) => {
    setState((prev) => {
      const next = fn(prev)
      const newMails = next.outbox.length - prev.outbox.length
      if (newMails > 0) setUnread((u) => u + newMails)
      return next
    })
    if (message) setToast(message)
  }

  const reset = () => {
    setState(seed(todayIso()))
    setUnread(0)
    setToast('Demo data reset')
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>✓</span>
          <div>
            <h1>HR Requests Automation</h1>
            <p>Interactive demo · Forms + Lists + Power Automate, simulated in the browser</p>
          </div>
        </div>
        <div className="controls">
          <div className="segmented" role="tablist" aria-label="View as">
            <button className={role === 'manager' ? 'on' : ''} onClick={() => setRole('manager')}>Manager portal</button>
            <button className={role === 'hr' ? 'on' : ''} onClick={() => setRole('hr')}>HR workspace</button>
          </div>
          <div className="clock" title="Simulated date. Advancing it runs the daily SLA flow.">
            <span className="muted">Today</span>
            <strong>{fmtDate(state.today)}</strong>
            <button onClick={() => apply((s) => advanceDays(s, 1), 'Day +1 · SLA flow ran')}>+1 day</button>
            <button onClick={() => apply((s) => advanceDays(s, 7), 'Week +1 · SLA flow ran 7×')}>+7 days</button>
          </div>
          <button className="ghost" onClick={reset}>Reset</button>
        </div>
      </header>

      <div className="intro">
        Every action below triggers the same automation as the real solution: intake flows create list items, status changes
        send e-mails to the manager, a scheduled flow recalculates the SLA every day, and PDFs are generated on demand.
        Watch the <b>Outbox</b> and <b>Flow runs</b> panels on the right. All data is fictitious and stays in your browser.
      </div>

      <div className="layout">
        <main>
          {role === 'manager' ? (
            <ManagerPortal
              state={state}
              manager={manager}
              setManager={setManager}
              onRequest={(r) => apply((s) => submitStaffingRequest(s, r), 'Request submitted · Flow 1 created the list item')}
              onChange={(c) => apply((s) => submitPersonnelChange(s, c), 'Change submitted · Flow 7 logged it to Excel and the list')}
            />
          ) : (
            <HrWorkspace
              state={state}
              onRpStatus={(id, st) => apply((s) => changeRpStatus(s, id, st))}
              onMpStatus={(id, st) => apply((s) => changeMpStatus(s, id, st))}
              onRunSla={() => apply(runSlaJob, 'SLA flow ran')}
              onRpPdf={(r) => {
                apply((s) => attachRpPdf(s, r.id))
                setDoc({ kind: 'rp', item: r })
              }}
              onMpPdf={(c) => {
                apply((s) => attachMpPdf(s, c.id))
                setDoc({ kind: 'mp', item: c })
              }}
              onSchedule={setInterviewFor}
            />
          )}
        </main>

        <aside className="side">
          <div className="segmented small">
            <button className={side === 'outbox' ? 'on' : ''} onClick={() => { setSide('outbox'); setUnread(0) }}>
              Outbox {unread > 0 && <span className="pill">{unread}</span>}
            </button>
            <button className={side === 'runs' ? 'on' : ''} onClick={() => setSide('runs')}>Flow runs</button>
          </div>
          {side === 'outbox' ? (
            <ul className="feed">
              {state.outbox.length === 0 && <li className="empty">No e-mails yet. Submit a request or change a status.</li>}
              {state.outbox.map((m) => (
                <li key={m.id} className="mail" onClick={() => setOpenMail(m)}>
                  <div className="row between"><span className="to">To: {m.to}</span><span className="muted">{fmtDate(m.at)}</span></div>
                  <div className="subj">{m.attachment && '📎 '}{m.subject}</div>
                  <div className="muted tiny">via Flow {m.flow}</div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="feed">
              {state.runs.length === 0 && <li className="empty">No runs yet.</li>}
              {state.runs.map((r) => (
                <li key={r.id} className="run">
                  <div className="row between"><b>Flow {r.flow}</b><span className="ok">Succeeded</span></div>
                  <div className="tiny">{r.detail}</div>
                  <div className="muted tiny">{fmtDate(r.at)}</div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <footer className="foot">
        Portfolio demo · the real solution runs on Microsoft Forms, SharePoint Lists and Power Automate · fictitious data only
      </footer>

      {openMail && (
        <Modal title={openMail.subject} onClose={() => setOpenMail(null)}>
          <div className="mailhead">
            <div><span className="muted">From:</span> hr@contoso.com (automated)</div>
            <div><span className="muted">To:</span> {openMail.to}</div>
            {openMail.cc && <div><span className="muted">Cc:</span> {openMail.cc}</div>}
            <div><span className="muted">Sent by:</span> Flow {openMail.flow}</div>
          </div>
          <pre className="mailbody">{openMail.body}</pre>
          {openMail.attachment && <div className="attach">📎 {openMail.attachment}</div>}
        </Modal>
      )}

      {doc && <DocModal doc={doc} onClose={() => setDoc(null)} />}

      {interviewFor && (
        <InterviewModal
          req={interviewFor}
          today={state.today}
          onClose={() => setInterviewFor(null)}
          onSave={(candidate, step, datetime) => {
            apply((s) => scheduleInterview(s, { requestId: interviewFor.id, candidate, step, datetime }), 'Interview scheduled · Flow 6 sent the notice')
            setInterviewFor(null)
          }}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

/* =================== Manager portal =================== */

function ManagerPortal(props: {
  state: AppState
  manager: Manager
  setManager: (m: Manager) => void
  onRequest: (r: NewRequest) => void
  onChange: (c: NewChange) => void
}) {
  const { state, manager, setManager } = props
  const [tab, setTab] = useState<'rp' | 'mp' | 'mine'>('rp')
  const mine = state.requests.filter((r) => r.managerEmail === manager.email)
  const mineMp = state.changes.filter((c) => c.managerEmail === manager.email)

  return (
    <section className="card">
      <div className="row between wrap gap">
        <div className="tabs">
          <button className={tab === 'rp' ? 'on' : ''} onClick={() => setTab('rp')}>New staffing request</button>
          <button className={tab === 'mp' ? 'on' : ''} onClick={() => setTab('mp')}>New personnel change</button>
          <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>My requests ({mine.length + mineMp.length})</button>
        </div>
        <label className="inline">
          Signed in as
          <select value={manager.email} onChange={(e) => setManager(MANAGERS.find((m) => m.email === e.target.value)!)}>
            {MANAGERS.map((m) => <option key={m.email} value={m.email}>{m.name} · {m.department}</option>)}
          </select>
        </label>
      </div>

      {tab === 'rp' && <RequestForm key={manager.email} manager={manager} onSubmit={(r) => { props.onRequest(r); setTab('mine') }} />}
      {tab === 'mp' && <ChangeForm key={manager.email} manager={manager} onSubmit={(c) => { props.onChange(c); setTab('mine') }} />}
      {tab === 'mine' && (
        <div className="stack">
          <h3>Staffing requests</h3>
          {mine.length === 0 ? <p className="muted">None yet.</p> : (
            <table>
              <thead><tr><th>Request</th><th>Position</th><th>Opened</th><th>Status</th><th>SLA</th></tr></thead>
              <tbody>
                {mine.map((r) => (
                  <tr key={r.id}><td>{rpCode(r)}</td><td>{r.position}</td><td>{fmtDate(r.openedOn)}</td><td><StatusBadge s={r.status} /></td><td><SlaBadge r={r} /></td></tr>
                ))}
              </tbody>
            </table>
          )}
          <h3>Personnel changes</h3>
          {mineMp.length === 0 ? <p className="muted">None yet.</p> : (
            <table>
              <thead><tr><th>Request</th><th>Employee</th><th>Type</th><th>Effective</th><th>Status</th></tr></thead>
              <tbody>
                {mineMp.map((c) => (
                  <tr key={c.id}><td>{c.code}</td><td>{c.employeeName}</td><td>{c.changeType}</td><td>{fmtDate(c.effectiveFrom)}</td><td><StatusBadge s={c.status} /></td></tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted tiny">You don’t need to check this page. Every status change is e-mailed to you automatically.</p>
        </div>
      )}
    </section>
  )
}

function RequestForm({ manager, onSubmit }: { manager: Manager; onSubmit: (r: NewRequest) => void }) {
  const [f, setF] = useState<NewRequest>({
    position: '',
    department: manager.department,
    manager: manager.name,
    managerEmail: manager.email,
    ccEmails: '',
    hours: '07:00–19:00',
    shift: '12x36',
    reason: 'Termination',
    replaced: '',
    postingType: 'External',
    notes: '',
  })
  const set = <K extends keyof NewRequest>(k: K, v: NewRequest[K]) => setF((x) => ({ ...x, [k]: v }))
  const needsReplaced = f.reason !== 'Headcount increase'

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(f)
      }}
    >
      <p className="formnote">Microsoft Forms · Staffing Request (RP)</p>
      <div className="grid">
        <Field label="Position *"><input required value={f.position} onChange={(e) => set('position', e.target.value)} placeholder="e.g. Nursing Technician" /></Field>
        <Field label="Department *"><input required value={f.department} onChange={(e) => set('department', e.target.value)} /></Field>
        <Field label="Work hours"><input value={f.hours} onChange={(e) => set('hours', e.target.value)} /></Field>
        <Field label="Shift pattern">
          <select value={f.shift} onChange={(e) => set('shift', e.target.value)}>{['12x36', '5x2', '6x1'].map((x) => <option key={x}>{x}</option>)}</select>
        </Field>
        <Field label="Opening reason *">
          <select value={f.reason} onChange={(e) => set('reason', e.target.value as NewRequest['reason'])}>
            {['Termination', 'Promotion', 'Headcount increase'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        {needsReplaced && (
          <Field label="Replaced employee *"><input required value={f.replaced} onChange={(e) => set('replaced', e.target.value)} placeholder="Fictitious name" /></Field>
        )}
        <Field label="Posting type">
          <select value={f.postingType} onChange={(e) => set('postingType', e.target.value as NewRequest['postingType'])}>
            {['Internal', 'External', 'Both'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Extra e-mails to copy"><input value={f.ccEmails} onChange={(e) => set('ccEmails', e.target.value)} placeholder="coordinator@contoso.com" /></Field>
      </div>
      <Field label="Notes"><textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} /></Field>
      {f.reason === 'Headcount increase' && <p className="hint">Headcount increases also trigger Flow 4: a PDF request document is generated and e-mailed to you.</p>}
      <div className="row end"><button className="primary" type="submit">Submit request</button></div>
    </form>
  )
}

function ChangeForm({ manager, onSubmit }: { manager: Manager; onSubmit: (c: NewChange) => void }) {
  const [f, setF] = useState<NewChange>({
    manager: manager.name,
    managerEmail: manager.email,
    changeType: 'Promotion with replacement',
    effectiveFrom: '',
    employeeName: '',
    employeeId: '',
    fromPosition: '',
    fromDepartment: manager.department,
    toPosition: '',
    toDepartment: manager.department,
    linkedExit: false,
    notes: '',
  })
  const set = <K extends keyof NewChange>(k: K, v: NewChange[K]) => setF((x) => ({ ...x, [k]: v }))
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); onSubmit(f) }}>
      <p className="formnote">Microsoft Forms · Personnel Change (MP)</p>
      <div className="grid">
        <Field label="Change type *">
          <select value={f.changeType} onChange={(e) => set('changeType', e.target.value as NewChange['changeType'])}>
            {CHANGE_TYPES.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Effective from *"><input required type="date" value={f.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)} /></Field>
        <Field label="Employee name *"><input required value={f.employeeName} onChange={(e) => set('employeeName', e.target.value)} placeholder="Fictitious name" /></Field>
        <Field label="Employee ID *"><input required value={f.employeeId} onChange={(e) => set('employeeId', e.target.value)} placeholder="E1234" /></Field>
        <Field label="Current position"><input value={f.fromPosition} onChange={(e) => set('fromPosition', e.target.value)} /></Field>
        <Field label="New position"><input value={f.toPosition} onChange={(e) => set('toPosition', e.target.value)} /></Field>
        <Field label="Current department"><input value={f.fromDepartment} onChange={(e) => set('fromDepartment', e.target.value)} /></Field>
        <Field label="New department"><input value={f.toDepartment} onChange={(e) => set('toDepartment', e.target.value)} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={f.linkedExit} onChange={(e) => set('linkedExit', e.target.checked)} /> Linked to another employee’s exit</label>
      <Field label="Notes"><textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} /></Field>
      <div className="row end"><button className="primary" type="submit">Submit change</button></div>
    </form>
  )
}

/* =================== HR workspace =================== */

function HrWorkspace(props: {
  state: AppState
  onRpStatus: (id: string, s: StaffingRequest['status']) => void
  onMpStatus: (id: string, s: PersonnelChange['status']) => void
  onRunSla: () => void
  onRpPdf: (r: StaffingRequest) => void
  onMpPdf: (c: PersonnelChange) => void
  onSchedule: (r: StaffingRequest) => void
}) {
  const { state } = props
  const [tab, setTab] = useState<'rp' | 'mp' | 'int'>('rp')

  const kpi = useMemo(() => {
    const active = state.requests.filter((r) => !['Closed', 'Cancelled'].includes(r.status))
    const running = active.filter((r) => r.status !== 'Frozen')
    const onTime = running.filter((r) => r.slaStatus === 'On time').length
    const closed = state.requests.filter((r) => r.status === 'Closed')
    const avgFill = closed.length ? Math.round(closed.reduce((a, r) => a + r.daysOpen, 0) / closed.length) : null
    return {
      open: running.length,
      frozen: active.length - running.length,
      late: running.length - onTime,
      onTimePct: running.length ? Math.round((onTime / running.length) * 100) : 100,
      pendingMp: state.changes.filter((c) => c.status === 'Under review').length,
      avgFill,
    }
  }, [state])

  return (
    <>
      <div className="kpis">
        <Kpi label="Open positions" value={kpi.open} />
        <Kpi label="Within SLA" value={`${kpi.onTimePct}%`} tone={kpi.onTimePct >= 80 ? 'good' : 'warn'} />
        <Kpi label="Late" value={kpi.late} tone={kpi.late ? 'bad' : undefined} />
        <Kpi label="Frozen" value={kpi.frozen} />
        <Kpi label="Avg. days to fill" value={kpi.avgFill ?? '—'} />
        <Kpi label="Changes under review" value={kpi.pendingMp} />
      </div>

      <section className="card">
        <div className="row between wrap gap">
          <div className="tabs">
            <button className={tab === 'rp' ? 'on' : ''} onClick={() => setTab('rp')}>Staffing Requests ({state.requests.length})</button>
            <button className={tab === 'mp' ? 'on' : ''} onClick={() => setTab('mp')}>Personnel Changes ({state.changes.length})</button>
            <button className={tab === 'int' ? 'on' : ''} onClick={() => setTab('int')}>Interview Schedule ({state.interviews.length})</button>
          </div>
          {tab === 'rp' && <button onClick={props.onRunSla}>▶ Run SLA flow now</button>}
        </div>

        {tab === 'rp' && (
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th>Request</th><th>Position · Dept.</th><th>Reason</th><th>Manager</th><th>Status</th><th>Days open</th><th>SLA</th><th></th></tr>
              </thead>
              <tbody>
                {state.requests.map((r) => (
                  <tr key={r.id}>
                    <td><b>{rpCode(r)}</b><div className="muted tiny">{fmtDate(r.openedOn)}</div></td>
                    <td>{r.position}<div className="muted tiny">{r.department}</div></td>
                    <td>{r.reason}{r.replaced && <div className="muted tiny">replaces {r.replaced}</div>}</td>
                    <td>{r.manager}</td>
                    <td>
                      <select className="status" value={r.status} onChange={(e) => props.onRpStatus(r.id, e.target.value as StaffingRequest['status'])}>
                        {RP_STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>
                      <SlaBar r={r} />
                    </td>
                    <td><SlaBadge r={r} /></td>
                    <td className="actions">
                      <button className="icon" title="Generate PDF (Flow 5)" onClick={() => props.onRpPdf(r)}>PDF</button>
                      <button className="icon" title="Schedule selection step (Flow 6)" onClick={() => props.onSchedule(r)} disabled={['Closed', 'Cancelled'].includes(r.status)}>📅</button>
                      {r.attachments.length > 0 && <span className="muted tiny" title={r.attachments.join(', ')}>📎{r.attachments.length}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted tiny">Change a status to trigger Flow 2: it stamps the matching date and e-mails the manager. Choosing the same status does nothing, because the flow checks “Get changes” first.</p>
          </div>
        )}

        {tab === 'mp' && (
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th>Request</th><th>Employee</th><th>Change</th><th>From → To</th><th>Effective</th><th>Status</th><th>Notified</th><th></th></tr>
              </thead>
              <tbody>
                {state.changes.map((c) => (
                  <tr key={c.id}>
                    <td><b>{c.code}</b><div className="muted tiny">{fmtDate(c.submittedOn)}</div></td>
                    <td>{c.employeeName}<div className="muted tiny">{c.employeeId}</div></td>
                    <td>{c.changeType}</td>
                    <td className="tiny">{c.fromPosition || '—'} · {c.fromDepartment}<br />→ {c.toPosition || '—'} · {c.toDepartment}</td>
                    <td>{fmtDate(c.effectiveFrom)}</td>
                    <td>
                      <select className="status" value={c.status} onChange={(e) => props.onMpStatus(c.id, e.target.value as PersonnelChange['status'])}>
                        {MP_STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="tiny">{c.notifiedStatus || '—'}</td>
                    <td className="actions">
                      <button className="icon" title="Generate PDF (Flow 9)" onClick={() => props.onMpPdf(c)}>PDF</button>
                      {c.attachments.length > 0 && <span className="muted tiny">📎{c.attachments.length}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted tiny">Flow 8 e-mails the manager on each status change and records it in “Notified”. If the status is saved again unchanged, no duplicate e-mail goes out.</p>
          </div>
        )}

        {tab === 'int' && (
          <div className="tablewrap">
            {state.interviews.length === 0 ? <p className="muted">Nothing scheduled. Use 📅 on a staffing request.</p> : (
              <table>
                <thead><tr><th>When</th><th>Step</th><th>Candidate</th><th>Request</th></tr></thead>
                <tbody>
                  {[...state.interviews].sort((a, b) => a.datetime.localeCompare(b.datetime)).map((i) => {
                    const r = state.requests.find((x) => x.id === i.requestId)
                    return (
                      <tr key={i.id}>
                        <td>{new Date(i.datetime).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                        <td>{i.step}</td>
                        <td>{i.candidate}</td>
                        <td>{r ? `${rpCode(r)} · ${r.position}` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </>
  )
}

/* =================== Small components =================== */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: 'good' | 'warn' | 'bad' }) {
  return <div className={`kpi ${tone ?? ''}`}><div className="kv">{value}</div><div className="kl">{label}</div></div>
}

function StatusBadge({ s }: { s: string }) {
  const tone =
    s === 'Closed' || s === 'Approved' ? 'good'
    : s === 'Cancelled' ? 'neutral'
    : s === 'Frozen' ? 'cold'
    : 'info'
  return <span className={`badge ${tone}`}>{s}</span>
}

function SlaBadge({ r }: { r: StaffingRequest }) {
  const tone = { 'On time': 'good', 'Closed on time': 'good', Late: 'bad', 'Closed late': 'warn', Frozen: 'cold', '—': 'neutral' }[r.slaStatus]
  return <span className={`badge ${tone}`}>{r.slaStatus}</span>
}

function SlaBar({ r }: { r: StaffingRequest }) {
  const pct = Math.min(100, Math.round((r.daysOpen / r.slaTarget) * 100))
  const over = r.daysOpen > r.slaTarget
  return (
    <div className="slabar" title={`${r.daysOpen} of ${r.slaTarget} days${r.daysFrozen ? ` · ${r.daysFrozen} frozen days excluded` : ''}`}>
      <span>{r.daysOpen}/{r.slaTarget}</span>
      <div className="track"><div className={`fill ${over ? 'over' : ''}`} style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="overlay" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between modalhead"><h3>{title}</h3><button className="ghost" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  )
}

function DocModal({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const rows: [string, string][] =
    doc.kind === 'rp'
      ? [
          ['Request', rpCode(doc.item)],
          ['Opened on', fmtDate(doc.item.openedOn)],
          ['Position', doc.item.position],
          ['Department', doc.item.department],
          ['Requesting manager', doc.item.manager],
          ['Work hours / shift', `${doc.item.hours} · ${doc.item.shift}`],
          ['Opening reason', doc.item.reason],
          ['Replaced employee', doc.item.replaced || '—'],
          ['Posting type', doc.item.postingType],
          ['Status', doc.item.status],
          ['Notes', doc.item.notes || '—'],
        ]
      : [
          ['Request', doc.item.code],
          ['Submitted on', fmtDate(doc.item.submittedOn)],
          ['Requesting manager', doc.item.manager],
          ['Change type', doc.item.changeType],
          ['Effective from', fmtDate(doc.item.effectiveFrom)],
          ['Employee', `${doc.item.employeeName} (${doc.item.employeeId})`],
          ['From', `${doc.item.fromPosition || '—'} · ${doc.item.fromDepartment}`],
          ['To', `${doc.item.toPosition || '—'} · ${doc.item.toDepartment}`],
          ['Linked to an exit', doc.item.linkedExit ? 'Yes' : 'No'],
          ['Status', doc.item.status],
          ['Notes', doc.item.notes || '—'],
        ]
  const title = doc.kind === 'rp' ? 'Staffing Request' : 'Personnel Change Request'
  return (
    <Modal title={`Generated PDF · Flow ${doc.kind === 'rp' ? 5 : 9}`} onClose={onClose} wide>
      <div className="paper" id="printable">
        <div className="paperhead">
          <div><b>Contoso Hospital</b><div className="muted tiny">Human Resources</div></div>
          <div className="muted tiny">Generated automatically</div>
        </div>
        <h2>{title}</h2>
        <table className="doc">
          <tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody>
        </table>
        <div className="signs"><div>Requesting manager</div><div>HR</div><div>Director</div></div>
      </div>
      <div className="row end gap noprint">
        <span className="muted tiny">Attached to the list item ✓</span>
        {window.self === window.top ? (
          <button className="primary" onClick={() => { try { window.print() } catch { /* printing blocked */ } }}>Print / Save as PDF</button>
        ) : (
          <span className="muted tiny">Printing is available when the demo is opened on its own page.</span>
        )}
      </div>
    </Modal>
  )
}

function InterviewModal(props: {
  req: StaffingRequest
  today: string
  onClose: () => void
  onSave: (candidate: string, step: InterviewStep, datetime: string) => void
}) {
  const [candidate, setCandidate] = useState('Candidate ' + String.fromCharCode(65 + Math.floor(Math.random() * 6)))
  const [step, setStep] = useState<InterviewStep>('HR interview')
  const [dt, setDt] = useState(`${props.today}T10:00`)
  return (
    <Modal title={`Schedule selection step · ${rpCode(props.req)}`} onClose={props.onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); props.onSave(candidate, step, dt) }}>
        <Field label="Candidate"><input required value={candidate} onChange={(e) => setCandidate(e.target.value)} /></Field>
        <Field label="Step">
          <select value={step} onChange={(e) => setStep(e.target.value as InterviewStep)}>{INTERVIEW_STEPS.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        <Field label="Date and time"><input required type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} /></Field>
        <div className="row end"><button className="primary" type="submit">Save · notify manager</button></div>
      </form>
    </Modal>
  )
}
