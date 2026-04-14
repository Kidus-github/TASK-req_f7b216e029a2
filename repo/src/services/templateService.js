export const TEMPLATES = [
  {
    id: 'incident-response',
    name: 'Incident Response',
    description: 'Standard incident escalation and resolution workflow.',
    nodes: [
      { type: 'start', name: 'Incident Reported', x: 80, y: 160 },
      { type: 'action', name: 'Triage & Classify', x: 300, y: 160 },
      { type: 'decision', name: 'Severity?', x: 540, y: 160 },
      { type: 'action', name: 'Escalate to Lead', x: 540, y: 360 },
      { type: 'action', name: 'Apply Quick Fix', x: 780, y: 100 },
      { type: 'action', name: 'Root Cause Analysis', x: 780, y: 280 },
      { type: 'action', name: 'Document Resolution', x: 1020, y: 200 },
      { type: 'end', name: 'Incident Closed', x: 1240, y: 200 },
    ],
    edges: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 4, label: 'Low' },
      { from: 2, to: 3, label: 'High' },
      { from: 3, to: 5 },
      { from: 4, to: 6 },
      { from: 5, to: 6 },
      { from: 6, to: 7 },
    ],
  },
  {
    id: 'approval-chain',
    name: 'Approval Chain',
    description: 'Multi-level document approval with reject loop.',
    nodes: [
      { type: 'start', name: 'Submit Document', x: 80, y: 160 },
      { type: 'action', name: 'Manager Review', x: 320, y: 160 },
      { type: 'decision', name: 'Approved?', x: 560, y: 160 },
      { type: 'action', name: 'Revise Document', x: 560, y: 360 },
      { type: 'action', name: 'Director Sign-off', x: 800, y: 160 },
      { type: 'end', name: 'Published', x: 1040, y: 160 },
    ],
    edges: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 4, label: 'Yes' },
      { from: 2, to: 3, label: 'No' },
      { from: 3, to: 1, label: 'Resubmit' },
      { from: 4, to: 5 },
    ],
  },
  {
    id: 'safety-checklist',
    name: 'Safety Checklist',
    description: 'Pre-operation safety verification flow.',
    nodes: [
      { type: 'start', name: 'Begin Inspection', x: 80, y: 160 },
      { type: 'action', name: 'Check PPE', x: 300, y: 160 },
      { type: 'action', name: 'Verify Equipment', x: 520, y: 160 },
      { type: 'decision', name: 'All Clear?', x: 740, y: 160 },
      { type: 'action', name: 'Log Deficiency', x: 740, y: 360 },
      { type: 'end', name: 'Proceed', x: 960, y: 100 },
      { type: 'end', name: 'Halt Operation', x: 960, y: 360 },
      { type: 'note', name: 'Refer to Safety Manual Section 4.2', x: 300, y: 340 },
    ],
    edges: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 5, label: 'Yes' },
      { from: 3, to: 4, label: 'No' },
      { from: 4, to: 6 },
    ],
  },
]

export const templateService = {
  getAll() {
    return TEMPLATES
  },

  getById(id) {
    return TEMPLATES.find((t) => t.id === id) || null
  },
}
