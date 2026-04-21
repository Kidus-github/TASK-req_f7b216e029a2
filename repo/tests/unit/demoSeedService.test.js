import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { ensureDemoSeeded, DEMO_ACCOUNT } from '@/services/demoSeedService'
import { authService } from '@/services/authService'
import { diagramService } from '@/services/diagramService'
import { localComplianceService } from '@/services/localComplianceService'
import { resetDatabase } from './helpers/testHarness'

beforeEach(async () => {
  localStorage.clear()
  await resetDatabase()
})

describe('demoSeedService', () => {
  it('creates the documented demo account, seeded diagrams, and compliance note idempotently', async () => {
    await ensureDemoSeeded()
    await ensureDemoSeeded()

    const users = await authService.getAllUsers()
    expect(users).toHaveLength(1)
    expect(users[0].username).toBe(DEMO_ACCOUNT.username)

    const diagrams = await diagramService.getByOwner(users[0].userId)
    const titles = diagrams.map((diagram) => diagram.title).sort()
    expect(titles).toEqual(['Demo Approval Library', 'Demo Incident Response'])
    expect(diagrams.find((diagram) => diagram.title === 'Demo Approval Library')?.status).toBe('published')
    expect(diagrams.find((diagram) => diagram.title === 'Demo Incident Response')?.status).toBe('draft')

    const note = await localComplianceService.getAuditRetentionNote(users[0].userId)
    expect(note.auditRetentionNotes).toContain('Retain local audit events for 12 months')
  })
})
