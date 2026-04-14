export const PERSONA_ORDER = ['author', 'reviewer', 'viewer']

export const PERSONA_CONFIG = {
  author: {
    label: 'Author',
    badgeTone: 'author',
    dashboardPrompt: 'Draft, edit, and prepare SOP flows for approval.',
    diagramsPrompt: 'Create blank diagrams or start from a template.',
    editorModeLabel: 'Author Workspace',
    editorPrompt: 'Editing tools are enabled for drafting and revisions.',
    canCreateDiagram: true,
    canEditCanvas: true,
    canUseLibrary: true,
    canEditInspector: true,
    canDeleteItems: true,
    canImport: true,
    canGenerateTraceability: true,
    canPublish: true,
    canInspect: true,
  },
  reviewer: {
    label: 'Reviewer',
    badgeTone: 'reviewer',
    dashboardPrompt: 'Review structure, verification coverage, and inspection readiness.',
    diagramsPrompt: 'Open diagrams for review, verification, and publication decisions.',
    editorModeLabel: 'Reviewer Workspace',
    editorPrompt: 'Review tools are emphasized. Editing affordances are reduced for consistency.',
    canCreateDiagram: false,
    canEditCanvas: false,
    canUseLibrary: false,
    canEditInspector: false,
    canDeleteItems: false,
    canImport: false,
    canGenerateTraceability: false,
    canPublish: true,
    canInspect: true,
  },
  viewer: {
    label: 'Viewer',
    badgeTone: 'viewer',
    dashboardPrompt: 'Browse approved flows, inspect versions, and export references.',
    diagramsPrompt: 'View diagrams with reduced edit affordances.',
    editorModeLabel: 'Viewer Workspace',
    editorPrompt: 'Read-only viewing prompts are shown. Verification and export remain available.',
    canCreateDiagram: false,
    canEditCanvas: false,
    canUseLibrary: false,
    canEditInspector: false,
    canDeleteItems: false,
    canImport: false,
    canGenerateTraceability: false,
    canPublish: false,
    canInspect: false,
  },
}

export function getPersonaConfig(persona) {
  return PERSONA_CONFIG[persona] || PERSONA_CONFIG.author
}

export function normalizePersona(persona) {
  return PERSONA_ORDER.includes(persona) ? persona : 'author'
}
