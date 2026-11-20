export type RpStatus =
  | 'Received'
  | 'Under review'
  | 'In selection'
  | 'In hiring'
  | 'Frozen'
  | 'Closed'
  | 'Cancelled'

export const RP_STATUSES: RpStatus[] = [
  'Received',
  'Under review',
  'In selection',
  'In hiring',
  'Frozen',
  'Closed',
  'Cancelled',
]

export type SlaStatus = 'On time' | 'Late' | 'Closed on time' | 'Closed late' | 'Frozen' | '—'

export type OpeningReason = 'Termination' | 'Promotion' | 'Headcount increase'
export type PostingType = 'Internal' | 'External' | 'Both'

export interface StaffingRequest {
  id: string
  no: number
  position: string
  department: string
  manager: string
  managerEmail: string
  ccEmails: string
  hours: string
  shift: string
  reason: OpeningReason
  replaced: string
  postingType: PostingType
  notes: string
  status: RpStatus
  openedOn: string
  selectionDate?: string
  hiringDate?: string
  closedOn?: string
  frozenSince?: string
  frozenDaysAccum: number
  daysFrozen: number
  daysOpen: number
  slaTarget: number
  slaStatus: SlaStatus
  attachments: string[]
}

export type MpStatus = 'Under review' | 'Approved' | 'Cancelled'
export const MP_STATUSES: MpStatus[] = ['Under review', 'Approved', 'Cancelled']

export const CHANGE_TYPES = [
  'Promotion with replacement',
  'Promotion without replacement',
  'Transfer with replacement',
  'Transfer without replacement',
  'Other',
] as const
export type ChangeType = (typeof CHANGE_TYPES)[number]

export interface PersonnelChange {
  id: string
  code: string
  submittedOn: string
  manager: string
  managerEmail: string
  changeType: ChangeType
  effectiveFrom: string
  employeeName: string
  employeeId: string
  fromPosition: string
  fromDepartment: string
  toPosition: string
  toDepartment: string
  linkedExit: boolean
  notes: string
  status: MpStatus
  notifiedStatus: string
  attachments: string[]
}

export const INTERVIEW_STEPS = [
  'Screening',
  'HR interview',
  'Manager interview',
  'Group selection',
  'Technical assessment',
  'Other',
] as const
export type InterviewStep = (typeof INTERVIEW_STEPS)[number]

export interface Interview {
  id: string
  requestId: string
  candidate: string
  step: InterviewStep
  datetime: string
}

export interface Email {
  id: string
  at: string
  flow: string
  to: string
  cc?: string
  subject: string
  body: string
  attachment?: string
}

export interface FlowRun {
  id: string
  at: string
  flow: string
  detail: string
}

export interface AppState {
  today: string
  requests: StaffingRequest[]
  changes: PersonnelChange[]
  interviews: Interview[]
  outbox: Email[]
  runs: FlowRun[]
  excelRows: number
  nextRp: number
  nextMp: number
}

export interface Manager {
  name: string
  email: string
  department: string
}

export const MANAGERS: Manager[] = [
  { name: 'Ana Example', email: 'ana.example@contoso.com', department: 'Inpatient Unit' },
  { name: 'Bruno Example', email: 'bruno.example@contoso.com', department: 'Outpatient Clinic' },
  { name: 'Carla Example', email: 'carla.example@contoso.com', department: 'Pharmacy' },
]
