import type {
  AppState,
  Email,
  FlowRun,
  Interview,
  MpStatus,
  PersonnelChange,
  RpStatus,
  SlaStatus,
  StaffingRequest,
} from './types'

/* ---------- Flow names (mirror the 9 Power Automate flows) ---------- */
export const FLOWS = {
  rpIntake: '1 · Staffing request: Form → List',
  rpStatus: '2 · Request status tracking',
  sla: '3 · Daily SLA update',
  headcount: '4 · Headcount increase: send request to manager',
  rpPdf: '5 · Generate staffing request PDF',
  interview: '6 · Interview schedule notice',
  mpIntake: '7 · Personnel change: Form → Excel and List',
  mpStatus: '8 · Personnel change: status notice to manager',
  mpPdf: '9 · Generate personnel change PDF',
} as const

export const HR_EMAIL = 'hr@contoso.com'
export const DEFAULT_SLA = 30

/* ---------- Date helpers (simulated calendar) ---------- */
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
export const fmtDate = (iso?: string) =>
  iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

let seq = 0
export const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`

const run = (s: AppState, flow: string, detail: string): FlowRun => ({ id: uid(), at: s.today, flow, detail })
const mail = (s: AppState, e: Omit<Email, 'id' | 'at'>): Email => ({ id: uid(), at: s.today, ...e })

/* ---------- Flow 3: SLA calculation ---------- */
export function computeSla(r: StaffingRequest, today: string): StaffingRequest {
  const end = r.closedOn ?? today
  const currentFrozen = r.status === 'Frozen' && r.frozenSince ? daysBetween(r.frozenSince, today) : 0
  const daysFrozen = r.frozenDaysAccum + currentFrozen
  const daysOpen = Math.max(0, daysBetween(r.openedOn, end) - daysFrozen)
  let slaStatus: SlaStatus
  if (r.status === 'Cancelled') slaStatus = '—'
  else if (r.status === 'Frozen') slaStatus = 'Frozen'
  else if (r.status === 'Closed') slaStatus = daysOpen <= r.slaTarget ? 'Closed on time' : 'Closed late'
  else slaStatus = daysOpen <= r.slaTarget ? 'On time' : 'Late'
  return { ...r, daysOpen, daysFrozen, slaStatus }
}

export function runSlaJob(s: AppState): AppState {
  const requests = s.requests.map((r) => computeSla(r, s.today))
  const late = requests.filter((r) => r.slaStatus === 'Late').length
  return {
    ...s,
    requests,
    runs: [run(s, FLOWS.sla, `Updated ${requests.length} items · ${late} late`), ...s.runs],
  }
}

export function advanceDays(s: AppState, n: number): AppState {
  let next = s
  for (let i = 0; i < n; i++) next = runSlaJob({ ...next, today: addDays(next.today, 1) })
  return next
}

/* ---------- Flow 1 (+4): new staffing request ---------- */
export type NewRequest = Omit<
  StaffingRequest,
  'id' | 'no' | 'status' | 'openedOn' | 'frozenDaysAccum' | 'daysFrozen' | 'daysOpen' | 'slaTarget' | 'slaStatus' | 'attachments'
>

export function submitStaffingRequest(s: AppState, input: NewRequest): AppState {
  const no = s.nextRp
  let req: StaffingRequest = computeSla(
    {
      ...input,
      id: uid(),
      no,
      status: 'Received',
      openedOn: s.today,
      frozenDaysAccum: 0,
      daysFrozen: 0,
      daysOpen: 0,
      slaTarget: DEFAULT_SLA,
      slaStatus: 'On time',
      attachments: [],
    },
    s.today,
  )
  const code = rpCode(req)
  const runs = [run(s, FLOWS.rpIntake, `Form response → item ${code} created (status: Received)`)]
  const outbox = [
    mail(s, {
      flow: FLOWS.rpIntake,
      to: input.managerEmail,
      cc: [HR_EMAIL, input.ccEmails].filter(Boolean).join('; '),
      subject: `[${code}] Staffing request received — ${input.position}`,
      body: `Hi ${input.manager},\n\nYour request to open a ${input.position} position (${input.department}) was received by HR and registered as ${code}.\nReason: ${input.reason}. Posting: ${input.postingType}.\n\nYou will get an e-mail every time the status changes.\n\n— HR (automatic message)`,
    }),
  ]
  if (input.reason === 'Headcount increase') {
    const pdf = `${code}_staffing_request.pdf`
    req = { ...req, attachments: [pdf] }
    runs.unshift(run(s, FLOWS.headcount, `HTML → PDF generated, attached to ${code}, sent to manager, temp file deleted`))
    outbox.unshift(
      mail(s, {
        flow: FLOWS.headcount,
        to: input.managerEmail,
        subject: `[${code}] Headcount increase — request document`,
        body: `Hi ${input.manager},\n\nAttached is the formal document for the headcount increase request ${code} (${input.position}).\n\n— HR (automatic message)`,
        attachment: pdf,
      }),
    )
  }
  return {
    ...s,
    nextRp: no + 1,
    requests: [req, ...s.requests],
    runs: [...runs, ...s.runs],
    outbox: [...outbox, ...s.outbox],
  }
}

export const rpCode = (r: Pick<StaffingRequest, 'no'>) => `RP-${String(r.no).padStart(3, '0')}`

/* ---------- Flow 2: status tracking (Get changes → stamp dates → notify) ---------- */
export function changeRpStatus(s: AppState, id: string, status: RpStatus): AppState {
  const old = s.requests.find((r) => r.id === id)
  if (!old || old.status === status) {
    // "Get changes" says Status did not change → flow ends without doing anything
    return s
  }
  let r: StaffingRequest = { ...old, status }
  const stamped: string[] = []
  if (old.status === 'Frozen' && old.frozenSince) {
    r.frozenDaysAccum += daysBetween(old.frozenSince, s.today)
    r.frozenSince = undefined
  }
  if (status === 'Frozen') { r.frozenSince = s.today; stamped.push('Frozen since') }
  if (status === 'In selection' && !r.selectionDate) { r.selectionDate = s.today; stamped.push('Selection date') }
  if (status === 'In hiring' && !r.hiringDate) { r.hiringDate = s.today; stamped.push('Hiring date') }
  if (status === 'Closed' || status === 'Cancelled') { r.closedOn = s.today; stamped.push('Closed on') }
  else r.closedOn = undefined
  r = computeSla(r, s.today)
  const code = rpCode(r)
  return {
    ...s,
    requests: s.requests.map((x) => (x.id === id ? r : x)),
    runs: [
      run(s, FLOWS.rpStatus, `${code}: Status changed ${old.status} → ${status}${stamped.length ? ` · stamped ${stamped.join(', ')}` : ''} · manager notified`),
      ...s.runs,
    ],
    outbox: [
      mail(s, {
        flow: FLOWS.rpStatus,
        to: r.managerEmail,
        cc: r.ccEmails || undefined,
        subject: `[${code}] Status update: ${status}`,
        body: `Hi ${r.manager},\n\nThe status of your request ${code} (${r.position}) changed from "${old.status}" to "${status}".\nDays open: ${r.daysOpen} of ${r.slaTarget} (SLA: ${r.slaStatus}).\n\n— HR (automatic message)`,
      }),
      ...s.outbox,
    ],
  }
}

/* ---------- Flow 5 / 9: PDF generation ---------- */
export function attachRpPdf(s: AppState, id: string): AppState {
  const r = s.requests.find((x) => x.id === id)
  if (!r) return s
  const name = `${rpCode(r)}_staffing_request.pdf`
  return {
    ...s,
    requests: s.requests.map((x) => (x.id === id && !x.attachments.includes(name) ? { ...x, attachments: [...x.attachments, name] } : x)),
    runs: [run(s, FLOWS.rpPdf, `Get item → Create HTML → Convert to PDF → attached ${name} → temp file deleted`), ...s.runs],
  }
}

export function attachMpPdf(s: AppState, id: string): AppState {
  const c = s.changes.find((x) => x.id === id)
  if (!c) return s
  const name = `${c.code}_personnel_change.pdf`
  return {
    ...s,
    changes: s.changes.map((x) => (x.id === id && !x.attachments.includes(name) ? { ...x, attachments: [...x.attachments, name] } : x)),
    runs: [run(s, FLOWS.mpPdf, `Get item → Create HTML → Convert to PDF → attached ${name} → temp file deleted`), ...s.runs],
  }
}

/* ---------- Flow 6: interview schedule ---------- */
export function scheduleInterview(s: AppState, it: Omit<Interview, 'id'>): AppState {
  const r = s.requests.find((x) => x.id === it.requestId)
  if (!r) return s
  const code = rpCode(r)
  const when = new Date(it.datetime).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  return {
    ...s,
    interviews: [{ ...it, id: uid() }, ...s.interviews],
    runs: [run(s, FLOWS.interview, `${it.step} for ${code} on ${when} · notice sent`), ...s.runs],
    outbox: [
      mail(s, {
        flow: FLOWS.interview,
        to: r.managerEmail,
        cc: HR_EMAIL,
        subject: `[${code}] ${it.step} scheduled — ${when}`,
        body: `Hi ${r.manager},\n\nA selection step was scheduled for request ${code} (${r.position}):\n• Step: ${it.step}\n• Candidate: ${it.candidate}\n• When: ${when}\n\n— HR (automatic message)`,
      }),
      ...s.outbox,
    ],
  }
}

/* ---------- Flow 7: new personnel change ---------- */
export type NewChange = Omit<PersonnelChange, 'id' | 'code' | 'submittedOn' | 'status' | 'notifiedStatus' | 'attachments'>

export function submitPersonnelChange(s: AppState, input: NewChange): AppState {
  const code = `MP-${String(s.nextMp).padStart(3, '0')}`
  const c: PersonnelChange = {
    ...input,
    id: uid(),
    code,
    submittedOn: s.today,
    status: 'Under review',
    notifiedStatus: '',
    attachments: [],
  }
  const withItem: AppState = {
    ...s,
    nextMp: s.nextMp + 1,
    excelRows: s.excelRows + 1,
    changes: [c, ...s.changes],
    runs: [run(s, FLOWS.mpIntake, `Form response → Excel log row #${s.excelRows + 1} → SharePoint HTTP POST created ${code}`), ...s.runs],
    outbox: [
      mail(s, {
        flow: FLOWS.mpIntake,
        to: input.managerEmail,
        cc: HR_EMAIL,
        subject: `[${code}] Personnel change received — ${input.employeeName}`,
        body: `Hi ${input.manager},\n\nYour request (${input.changeType}) for ${input.employeeName} effective ${fmtDate(input.effectiveFrom)} was registered as ${code}.\n\n— HR (automatic message)`,
      }),
      ...s.outbox,
    ],
  }
  // Flow 8 fires on "item created" too → first status notice
  return notifyMpStatus(withItem, c.id)
}

/* ---------- Flow 8: MP status notice (dedup via "Notified status") ---------- */
function notifyMpStatus(s: AppState, id: string): AppState {
  const c = s.changes.find((x) => x.id === id)
  if (!c || c.notifiedStatus === c.status) {
    return c
      ? { ...s, runs: [run(s, FLOWS.mpStatus, `${c.code}: status "${c.status}" already notified → skipped (no duplicate e-mail)`), ...s.runs] }
      : s
  }
  return {
    ...s,
    changes: s.changes.map((x) => (x.id === id ? { ...x, notifiedStatus: c.status } : x)),
    runs: [run(s, FLOWS.mpStatus, `${c.code}: e-mailed status "${c.status}" → wrote Notified status via SharePoint HTTP`), ...s.runs],
    outbox: [
      mail(s, {
        flow: FLOWS.mpStatus,
        to: c.managerEmail,
        subject: `[${c.code}] Status: ${c.status}`,
        body: `Hi ${c.manager},\n\nThe personnel change ${c.code} for ${c.employeeName} (${c.changeType}) is now "${c.status}".\n\n— HR (automatic message)`,
      }),
      ...s.outbox,
    ],
  }
}

export function changeMpStatus(s: AppState, id: string, status: MpStatus): AppState {
  const next = { ...s, changes: s.changes.map((x) => (x.id === id ? { ...x, status } : x)) }
  return notifyMpStatus(next, id)
}

/* ---------- Seed data (fictitious) ---------- */
export function seed(today: string): AppState {
  const base = (
    no: number,
    p: Partial<StaffingRequest> & Pick<StaffingRequest, 'position' | 'department' | 'manager' | 'managerEmail' | 'reason' | 'status' | 'openedOn'>,
  ): StaffingRequest =>
    computeSla(
      {
        id: uid(),
        no,
        ccEmails: '',
        hours: '07:00–19:00',
        shift: '12x36',
        replaced: '',
        postingType: 'External',
        notes: '',
        frozenDaysAccum: 0,
        daysFrozen: 0,
        daysOpen: 0,
        slaTarget: DEFAULT_SLA,
        slaStatus: 'On time',
        attachments: [],
        ...p,
      },
      today,
    )
  const requests: StaffingRequest[] = [
    base(5, { position: 'Admin Assistant', department: 'Finance', manager: 'Carla Example', managerEmail: 'carla.example@contoso.com', reason: 'Headcount increase', status: 'Frozen', openedOn: addDays(today, -20), frozenSince: addDays(today, -6), hours: '08:00–17:00', shift: '5x2', attachments: ['RP-005_staffing_request.pdf'] }),
    base(4, { position: 'Lab Assistant', department: 'Laboratory', manager: 'Bruno Example', managerEmail: 'bruno.example@contoso.com', reason: 'Termination', replaced: 'Peter Sample', status: 'In hiring', openedOn: addDays(today, -41), selectionDate: addDays(today, -25), hiringDate: addDays(today, -3), hours: '19:00–07:00' }),
    base(3, { position: 'Pharmacist', department: 'Pharmacy', manager: 'Carla Example', managerEmail: 'carla.example@contoso.com', reason: 'Promotion', replaced: 'Maria Sample', postingType: 'Internal', status: 'Closed', openedOn: addDays(today, -40), selectionDate: addDays(today, -30), hiringDate: addDays(today, -20), closedOn: addDays(today, -15), hours: '13:00–22:00', shift: '6x1' }),
    base(2, { position: 'Receptionist', department: 'Outpatient Clinic', manager: 'Bruno Example', managerEmail: 'bruno.example@contoso.com', reason: 'Headcount increase', postingType: 'Both', status: 'Received', openedOn: addDays(today, -3), hours: '08:00–17:00', shift: '5x2', attachments: ['RP-002_staffing_request.pdf'] }),
    base(1, { position: 'Nursing Technician', department: 'Inpatient Unit', manager: 'Ana Example', managerEmail: 'ana.example@contoso.com', reason: 'Termination', replaced: 'John Sample', status: 'In selection', openedOn: addDays(today, -26), selectionDate: addDays(today, -12) }),
  ]
  const changes: PersonnelChange[] = [
    { id: uid(), code: 'MP-002', submittedOn: addDays(today, -2), manager: 'Bruno Example', managerEmail: 'bruno.example@contoso.com', changeType: 'Transfer without replacement', effectiveFrom: addDays(today, 14), employeeName: 'Julia Sample', employeeId: 'E1002', fromPosition: 'Receptionist', fromDepartment: 'Outpatient Clinic', toPosition: 'Receptionist', toDepartment: 'Emergency', linkedExit: false, notes: '', status: 'Under review', notifiedStatus: 'Under review', attachments: [] },
    { id: uid(), code: 'MP-001', submittedOn: addDays(today, -15), manager: 'Ana Example', managerEmail: 'ana.example@contoso.com', changeType: 'Promotion with replacement', effectiveFrom: addDays(today, 5), employeeName: 'Lucas Sample', employeeId: 'E1001', fromPosition: 'Nursing Technician', fromDepartment: 'Inpatient Unit', toPosition: 'Nurse', toDepartment: 'Inpatient Unit', linkedExit: false, notes: '', status: 'Approved', notifiedStatus: 'Approved', attachments: ['MP-001_personnel_change.pdf'] },
  ]
  const interviews: Interview[] = [
    { id: uid(), requestId: requests[4].id, candidate: 'Candidate A', step: 'HR interview', datetime: `${addDays(today, 2)}T10:30` },
  ]
  return { today, requests, changes, interviews, outbox: [], runs: [], excelRows: 2, nextRp: 6, nextMp: 3 }
}
