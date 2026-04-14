import { openDB } from 'idb'

const DB_NAME = 'flowforge-sop'
const DB_VERSION = 1

export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Users
      if (!db.objectStoreNames.contains('users')) {
        const users = db.createObjectStore('users', { keyPath: 'userId' })
        users.createIndex('by-username', 'usernameLower', { unique: true })
      }

      // User profile preferences
      if (!db.objectStoreNames.contains('userPreferences')) {
        db.createObjectStore('userPreferences', { keyPath: 'userId' })
      }

      // Diagrams
      if (!db.objectStoreNames.contains('diagrams')) {
        const diagrams = db.createObjectStore('diagrams', { keyPath: 'diagramId' })
        diagrams.createIndex('by-owner', 'ownerUserId')
        diagrams.createIndex('by-status', 'status')
      }

      // Diagram nodes
      if (!db.objectStoreNames.contains('nodes')) {
        const nodes = db.createObjectStore('nodes', { keyPath: 'nodeId' })
        nodes.createIndex('by-diagram', 'diagramId')
      }

      // Diagram edges
      if (!db.objectStoreNames.contains('edges')) {
        const edges = db.createObjectStore('edges', { keyPath: 'edgeId' })
        edges.createIndex('by-diagram', 'diagramId')
      }

      // Diagram version snapshots
      if (!db.objectStoreNames.contains('snapshots')) {
        const snapshots = db.createObjectStore('snapshots', { keyPath: 'snapshotId' })
        snapshots.createIndex('by-diagram', 'diagramId')
        snapshots.createIndex('by-diagram-version', ['diagramId', 'versionNumber'])
      }

      // Traceability assignments
      if (!db.objectStoreNames.contains('traceability')) {
        const trace = db.createObjectStore('traceability', { keyPath: 'assignmentId' })
        trace.createIndex('by-diagram', 'diagramId')
        trace.createIndex('by-node', 'nodeId')
      }

      // Inspection records
      if (!db.objectStoreNames.contains('inspections')) {
        const inspections = db.createObjectStore('inspections', { keyPath: 'inspectionId' })
        inspections.createIndex('by-diagram', 'diagramId')
      }

      // Inspection results
      if (!db.objectStoreNames.contains('inspectionResults')) {
        const results = db.createObjectStore('inspectionResults', { keyPath: 'resultId' })
        results.createIndex('by-inspection', 'inspectionId')
      }

      // Publish events
      if (!db.objectStoreNames.contains('publishEvents')) {
        const pub = db.createObjectStore('publishEvents', { keyPath: 'publishEventId' })
        pub.createIndex('by-diagram', 'diagramId')
      }

      // Embedded images
      if (!db.objectStoreNames.contains('embeddedImages')) {
        const images = db.createObjectStore('embeddedImages', { keyPath: 'imageId' })
        images.createIndex('by-diagram', 'diagramId')
      }

      // Import jobs
      if (!db.objectStoreNames.contains('importJobs')) {
        db.createObjectStore('importJobs', { keyPath: 'importJobId' })
      }

      // Import errors
      if (!db.objectStoreNames.contains('importErrors')) {
        const ierr = db.createObjectStore('importErrors', { keyPath: 'importErrorId' })
        ierr.createIndex('by-job', 'importJobId')
      }

      // Audit events
      if (!db.objectStoreNames.contains('auditEvents')) {
        const audit = db.createObjectStore('auditEvents', { keyPath: 'auditEventId' })
        audit.createIndex('by-entity', ['entityType', 'entityId'])
        audit.createIndex('by-actor', 'actedByUserId')
        audit.createIndex('by-time', 'actedAt')
      }

      // Session records
      if (!db.objectStoreNames.contains('sessions')) {
        const sessions = db.createObjectStore('sessions', { keyPath: 'sessionId' })
        sessions.createIndex('by-user', 'userId')
      }

      // Encryption metadata
      if (!db.objectStoreNames.contains('encryptionMetadata')) {
        const enc = db.createObjectStore('encryptionMetadata', { keyPath: 'encryptionRefId' })
        enc.createIndex('by-scope', ['scopeType', 'keyVersion'])
      }

      // Retraction records
      if (!db.objectStoreNames.contains('retractionRecords')) {
        const ret = db.createObjectStore('retractionRecords', { keyPath: 'retractionId' })
        ret.createIndex('by-diagram', 'diagramId')
      }
    },
  })
}

export function getTimestamp() {
  const now = new Date()
  return {
    iso: now.toISOString(),
    offset: now.getTimezoneOffset(),
  }
}
