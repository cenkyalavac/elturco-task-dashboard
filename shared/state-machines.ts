// ============================================
// PROJECT & JOB STATE MACHINES
// ============================================

// Project states and valid transitions
export const PROJECT_STATES = [
  'draft', 'quoted', 'confirmed', 'in_progress', 'delivered', 'completed', 'invoiced', 'closed', 'cancelled'
] as const;
export type ProjectState = typeof PROJECT_STATES[number];

export const PROJECT_TRANSITIONS: Record<string, { from: ProjectState[]; to: ProjectState; label: string }> = {
  quote:    { from: ['draft'],        to: 'quoted',      label: 'Send Quote' },
  confirm:  { from: ['quoted'],       to: 'confirmed',   label: 'Confirm' },
  start:    { from: ['confirmed'],    to: 'in_progress', label: 'Start' },
  deliver:  { from: ['in_progress'],  to: 'delivered',   label: 'Deliver' },
  complete: { from: ['delivered'],    to: 'completed',   label: 'Complete' },
  invoice:  { from: ['completed'],    to: 'invoiced',    label: 'Invoice' },
  close:    { from: ['invoiced'],     to: 'closed',      label: 'Close' },
  cancel:   { from: ['draft', 'quoted', 'confirmed', 'in_progress', 'delivered', 'completed', 'invoiced'], to: 'cancelled', label: 'Cancel' },
};

export function getValidProjectActions(currentStatus: string): string[] {
  return Object.entries(PROJECT_TRANSITIONS)
    .filter(([, t]) => t.from.includes(currentStatus as ProjectState))
    .map(([action]) => action);
}

export function validateProjectTransition(currentStatus: string, action: string): ProjectState | null {
  const transition = PROJECT_TRANSITIONS[action];
  if (!transition) return null;
  if (!transition.from.includes(currentStatus as ProjectState)) return null;
  return transition.to;
}

// Job states and valid transitions
export const JOB_STATES = [
  'unassigned', 'assigned', 'in_progress', 'delivered', 'approved', 'invoiced', 'revision', 'cancelled'
] as const;
export type JobState = typeof JOB_STATES[number];

export const JOB_TRANSITIONS: Record<string, { from: JobState[]; to: JobState; label: string }> = {
  assign:   { from: ['unassigned'],    to: 'assigned',    label: 'Assign' },
  start:    { from: ['assigned'],      to: 'in_progress', label: 'Start' },
  deliver:  { from: ['in_progress'],   to: 'delivered',   label: 'Deliver' },
  approve:  { from: ['delivered'],     to: 'approved',    label: 'Approve' },
  invoice:  { from: ['approved'],      to: 'invoiced',    label: 'Invoice' },
  revision: { from: ['delivered'],     to: 'in_progress', label: 'Revision' },
  cancel:   { from: ['unassigned', 'assigned', 'in_progress', 'delivered'], to: 'cancelled', label: 'Cancel' },
};

export function getValidJobActions(currentStatus: string): string[] {
  return Object.entries(JOB_TRANSITIONS)
    .filter(([, t]) => t.from.includes(currentStatus as JobState))
    .map(([action]) => action);
}

export function validateJobTransition(currentStatus: string, action: string): JobState | null {
  const transition = JOB_TRANSITIONS[action];
  if (!transition) return null;
  if (!transition.from.includes(currentStatus as JobState)) return null;
  return transition.to;
}

// Status badge color mapping
export const PROJECT_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  draft:       { bg: 'bg-gray-500/10',    text: 'text-gray-400',    label: 'Draft' },
  quoted:      { bg: 'bg-purple-500/10',   text: 'text-purple-400',  label: 'Quoted' },
  confirmed:   { bg: 'bg-blue-500/10',     text: 'text-blue-400',    label: 'Confirmed' },
  in_progress: { bg: 'bg-yellow-500/10',   text: 'text-yellow-400',  label: 'In Progress' },
  delivered:   { bg: 'bg-cyan-500/10',     text: 'text-cyan-400',    label: 'Delivered' },
  completed:   { bg: 'bg-emerald-500/10',  text: 'text-emerald-400', label: 'Completed' },
  invoiced:    { bg: 'bg-indigo-500/10',   text: 'text-indigo-400',  label: 'Invoiced' },
  closed:      { bg: 'bg-white/5',         text: 'text-white/40',    label: 'Closed' },
  cancelled:   { bg: 'bg-red-500/10',      text: 'text-red-400',     label: 'Cancelled' },
  // Legacy compat
  active:      { bg: 'bg-yellow-500/10',   text: 'text-yellow-400',  label: 'Active' },
  on_hold:     { bg: 'bg-orange-500/10',   text: 'text-orange-400',  label: 'On Hold' },
};

export const JOB_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  unassigned:  { bg: 'bg-gray-500/10',     text: 'text-gray-400',    label: 'Unassigned' },
  assigned:    { bg: 'bg-blue-500/10',     text: 'text-blue-400',    label: 'Assigned' },
  in_progress: { bg: 'bg-yellow-500/10',   text: 'text-yellow-400',  label: 'In Progress' },
  delivered:   { bg: 'bg-cyan-500/10',     text: 'text-cyan-400',    label: 'Delivered' },
  approved:    { bg: 'bg-emerald-500/10',  text: 'text-emerald-400', label: 'Approved' },
  invoiced:    { bg: 'bg-indigo-500/10',   text: 'text-indigo-400',  label: 'Invoiced' },
  revision:    { bg: 'bg-orange-500/10',   text: 'text-orange-400',  label: 'Revision' },
  cancelled:   { bg: 'bg-red-500/10',      text: 'text-red-400',     label: 'Cancelled' },
  // Legacy compat
  pending:     { bg: 'bg-gray-500/10',     text: 'text-gray-400',    label: 'Pending' },
  completed:   { bg: 'bg-emerald-500/10',  text: 'text-emerald-400', label: 'Completed' },
};
