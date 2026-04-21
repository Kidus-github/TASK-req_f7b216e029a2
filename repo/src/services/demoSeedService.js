import { getDB } from '@/db/schema'
import { authService } from '@/services/authService'
import { diagramService } from '@/services/diagramService'
import { canvasService } from '@/services/canvasService'
import { versionService } from '@/services/versionService'
import { traceabilityService } from '@/services/traceabilityService'
import { templateService } from '@/services/templateService'
import { localComplianceService } from '@/services/localComplianceService'

export const DEMO_ACCOUNT = {
  username: 'demo.author',
  password: 'DemoPass123!',
  realName: 'Demo Author',
  organization: 'FlowForge Demo Workspace',
}

const DEMO_DIAGRAMS = [
  {
    title: 'Demo Incident Response',
    description: 'Seeded draft workflow for editor, diagrams list, and dashboard checks.',
    templateId: 'incident-response',
    status: 'draft',
    generateTraceability: true,
  },
  {
    title: 'Demo Approval Library',
    description: 'Seeded published workflow for approved library and verification flows.',
    templateId: 'approval-chain',
    status: 'published',
    generateTraceability: true,
  },
]

const DEMO_RETENTION_NOTE =
  'Retain local audit events for 12 months on this device profile unless a supervisor authorizes earlier deletion.'

export async function ensureDemoSeeded() {
  const db = await getDB()
  const existing = await db.getFromIndex('users', 'by-username', DEMO_ACCOUNT.username.toLowerCase())
  const user = existing || await authService.createUser(DEMO_ACCOUNT)

  await ensureComplianceNote(user.userId)

  const diagrams = await diagramService.getByOwner(user.userId)
  const diagramsByTitle = new Map(diagrams.map((diagram) => [diagram.title, diagram]))

  for (const spec of DEMO_DIAGRAMS) {
    if (diagramsByTitle.has(spec.title)) continue
    await createSeedDiagram(user.userId, spec)
  }
}

async function ensureComplianceNote(userId) {
  const existing = await localComplianceService.getAuditRetentionNote(userId)
  if (existing.auditRetentionNotes) return
  await localComplianceService.saveAuditRetentionNote(userId, DEMO_RETENTION_NOTE, userId)
}

async function createSeedDiagram(ownerUserId, spec) {
  const diagram = await diagramService.create({
    title: spec.title,
    description: spec.description,
    ownerUserId,
  })

  const template = templateService.getById(spec.templateId)
  if (!template) {
    throw new Error(`Missing demo template: ${spec.templateId}`)
  }

  const nodeIdMap = new Map()
  for (const [index, nodeSpec] of template.nodes.entries()) {
    const node = await canvasService.addNode(
      diagram.diagramId,
      {
        ...nodeSpec,
        ownerTag: nodeSpec.ownerTag || 'Demo Team',
        departmentTag: nodeSpec.departmentTag || 'Operations',
      },
      ownerUserId
    )
    nodeIdMap.set(index, node.nodeId)
  }

  for (const edgeSpec of template.edges) {
    const sourceNodeId = nodeIdMap.get(edgeSpec.from)
    const targetNodeId = nodeIdMap.get(edgeSpec.to)
    if (!sourceNodeId || !targetNodeId) continue
    await canvasService.addEdge(diagram.diagramId, {
      sourceNodeId,
      targetNodeId,
      label: edgeSpec.label || '',
    })
  }

  if (spec.generateTraceability) {
    const nodes = await diagramService.getNodes(diagram.diagramId)
    await traceabilityService.generateCodes(
      diagram.diagramId,
      nodes.map((node) => node.nodeId),
      ownerUserId
    )
  }

  await versionService.createSnapshot(diagram.diagramId, 'manual', ownerUserId)

  if (spec.status === 'published') {
    await versionService.createSnapshot(diagram.diagramId, 'publish', ownerUserId)
    await diagramService.transitionStatus(diagram.diagramId, 'published', ownerUserId)
  }

  return diagram
}
