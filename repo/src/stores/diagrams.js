import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { diagramService } from '@/services/diagramService'
import { canvasService } from '@/services/canvasService'
import { imageService } from '@/services/imageService'

export const useDiagramStore = defineStore('diagrams', () => {
  const diagrams = ref([])
  const currentDiagram = ref(null)
  const currentNodes = ref([])
  const currentEdges = ref([])
  const currentImages = ref([])
  const selectedNodeIds = ref([])
  const selectedEdgeIds = ref([])
  const isDirty = ref(false)
  const loading = ref(false)

  const draftDiagrams = computed(() =>
    diagrams.value.filter((d) => d.status === 'draft')
  )
  const publishedDiagrams = computed(() =>
    diagrams.value.filter((d) => d.status === 'published')
  )

  async function loadUserDiagrams(userId) {
    loading.value = true
    try {
      diagrams.value = await diagramService.getByOwner(userId)
    } finally {
      loading.value = false
    }
  }

  async function loadAllDiagrams() {
    loading.value = true
    try {
      diagrams.value = await diagramService.getAll()
    } finally {
      loading.value = false
    }
  }

  async function loadPublishedDiagrams() {
    const published = await diagramService.getPublished()
    // Merge published diagrams that aren't already loaded
    const existingIds = new Set(diagrams.value.map((d) => d.diagramId))
    for (const d of published) {
      if (!existingIds.has(d.diagramId)) {
        diagrams.value.push(d)
      }
    }
  }

  async function createDiagram({ title, description, ownerUserId }) {
    const diagram = await diagramService.create({ title, description, ownerUserId })
    diagrams.value.push(diagram)
    return diagram
  }

  async function openDiagram(diagramId) {
    currentDiagram.value = await diagramService.getById(diagramId)
    currentImages.value = await imageService.getImages(diagramId)
    const imageMap = new Map(currentImages.value.map((image) => [image.imageId, image]))
    currentNodes.value = (await diagramService.getNodes(diagramId)).map((node) => hydrateNode(node, imageMap))
    currentEdges.value = await diagramService.getEdges(diagramId)
    return currentDiagram.value
  }

  async function updateDiagram(diagramId, updates, actedByUserId) {
    const updated = await diagramService.update(diagramId, updates, actedByUserId)
    const idx = diagrams.value.findIndex((d) => d.diagramId === diagramId)
    if (idx !== -1) diagrams.value[idx] = updated
    if (currentDiagram.value?.diagramId === diagramId) {
      currentDiagram.value = updated
    }
    return updated
  }

  async function deleteDiagram(diagramId, actedByUserId) {
    await diagramService.deleteDiagram(diagramId, actedByUserId)
    diagrams.value = diagrams.value.filter((d) => d.diagramId !== diagramId)
    if (currentDiagram.value?.diagramId === diagramId) {
      currentDiagram.value = null
      currentNodes.value = []
      currentEdges.value = []
      currentImages.value = []
    }
  }

  async function transitionStatus(diagramId, newStatus, actedByUserId, reason) {
    const updated = await diagramService.transitionStatus(diagramId, newStatus, actedByUserId, reason)
    const idx = diagrams.value.findIndex((d) => d.diagramId === diagramId)
    if (idx !== -1) diagrams.value[idx] = updated
    if (currentDiagram.value?.diagramId === diagramId) {
      currentDiagram.value = updated
    }
    return updated
  }

  function closeDiagram() {
    currentDiagram.value = null
    currentNodes.value = []
    currentEdges.value = []
    currentImages.value = []
    selectedNodeIds.value = []
    selectedEdgeIds.value = []
    isDirty.value = false
  }

  // Canvas operations
  async function addNode(nodeData, actedByUserId) {
    const diagramId = currentDiagram.value?.diagramId
    if (!diagramId) throw new Error('No diagram open.')
    const node = await canvasService.addNode(diagramId, nodeData, actedByUserId)
    currentNodes.value = [...currentNodes.value, hydrateNode(node, getImageMap())]
    isDirty.value = true
    return node
  }

  async function updateNodeInStore(nodeId, updates) {
    const node = await canvasService.updateNode(nodeId, updates)
    const idx = currentNodes.value.findIndex((n) => n.nodeId === nodeId)
    if (idx !== -1) currentNodes.value[idx] = hydrateNode(node, getImageMap())
    currentNodes.value = [...currentNodes.value]
    isDirty.value = true
    return node
  }

  function updateNodeLocal(nodeId, updates) {
    const idx = currentNodes.value.findIndex((n) => n.nodeId === nodeId)
    if (idx !== -1) {
      currentNodes.value[idx] = { ...currentNodes.value[idx], ...updates }
      currentNodes.value = [...currentNodes.value]
      isDirty.value = true
    }
  }

  async function deleteNodeWithEdges(nodeId, actedByUserId) {
    const diagramId = currentDiagram.value?.diagramId
    if (!diagramId) throw new Error('No diagram open.')
    const result = await canvasService.deleteNode(nodeId, diagramId, actedByUserId)
    currentNodes.value = currentNodes.value.filter((n) => n.nodeId !== nodeId)
    const deletedEdgeIds = new Set(result.deletedEdges.map((e) => e.edgeId))
    currentEdges.value = currentEdges.value.filter((e) => !deletedEdgeIds.has(e.edgeId))
    selectedNodeIds.value = selectedNodeIds.value.filter((id) => id !== nodeId)
    isDirty.value = true
    return result
  }

  async function restoreNodeWithEdges(node, edges) {
    const db = (await import('@/db/schema')).getDB()
    const database = await db
    const tx = database.transaction(['nodes', 'edges'], 'readwrite')
    await tx.objectStore('nodes').put(node)
    for (const edge of edges) {
      await tx.objectStore('edges').put(edge)
    }
    await tx.done
    currentNodes.value = [...currentNodes.value, node]
    currentNodes.value = currentNodes.value.map((entry) => hydrateNode(entry, getImageMap()))
    currentEdges.value = [...currentEdges.value, ...edges]
    isDirty.value = true
  }

  async function addEdge(edgeData) {
    const diagramId = currentDiagram.value?.diagramId
    if (!diagramId) throw new Error('No diagram open.')
    const edge = await canvasService.addEdge(diagramId, edgeData)
    currentEdges.value = [...currentEdges.value, edge]
    isDirty.value = true
    return edge
  }

  async function updateEdgeInStore(edgeId, updates) {
    const edge = await canvasService.updateEdge(edgeId, updates)
    const idx = currentEdges.value.findIndex((e) => e.edgeId === edgeId)
    if (idx !== -1) currentEdges.value[idx] = { ...edge }
    currentEdges.value = [...currentEdges.value]
    isDirty.value = true
    return edge
  }

  async function deleteEdgeFromStore(edgeId) {
    const edge = await canvasService.deleteEdge(edgeId)
    currentEdges.value = currentEdges.value.filter((e) => e.edgeId !== edgeId)
    selectedEdgeIds.value = selectedEdgeIds.value.filter((id) => id !== edgeId)
    isDirty.value = true
    return edge
  }

  async function restoreEdge(edge) {
    const db = (await import('@/db/schema')).getDB()
    const database = await db
    await database.put('edges', edge)
    currentEdges.value = [...currentEdges.value, edge]
    isDirty.value = true
  }

  function selectNode(nodeId, multi = false) {
    if (multi) {
      if (selectedNodeIds.value.includes(nodeId)) {
        selectedNodeIds.value = selectedNodeIds.value.filter((id) => id !== nodeId)
      } else {
        selectedNodeIds.value = [...selectedNodeIds.value, nodeId]
      }
    } else {
      selectedNodeIds.value = [nodeId]
      selectedEdgeIds.value = []
    }
  }

  function selectEdge(edgeId, multi = false) {
    if (multi) {
      if (selectedEdgeIds.value.includes(edgeId)) {
        selectedEdgeIds.value = selectedEdgeIds.value.filter((id) => id !== edgeId)
      } else {
        selectedEdgeIds.value = [...selectedEdgeIds.value, edgeId]
      }
    } else {
      selectedEdgeIds.value = [edgeId]
      selectedNodeIds.value = []
    }
  }

  function clearSelection() {
    selectedNodeIds.value = []
    selectedEdgeIds.value = []
  }

  function selectNodesInRect(rect) {
    selectedNodeIds.value = currentNodes.value
      .filter((n) => {
        return (
          n.x >= rect.x &&
          n.y >= rect.y &&
          n.x + n.width <= rect.x + rect.width &&
          n.y + n.height <= rect.y + rect.height
        )
      })
      .map((n) => n.nodeId)
  }

  async function attachNodeImage(nodeId, file, actedByUserId) {
    const diagramId = currentDiagram.value?.diagramId
    if (!diagramId) throw new Error('No diagram open.')

    const existingNode = currentNodes.value.find((node) => node.nodeId === nodeId)
    const previousImageId = existingNode?.imageId || null

    const image = await imageService.saveEmbeddedImage(diagramId, file, actedByUserId)
    currentImages.value = [...currentImages.value, image]
    await updateNodeInStore(nodeId, {
      imageId: image.imageId,
      imageAlt: file.name,
    })

    if (previousImageId) {
      const stillReferenced = currentNodes.value.some((node) => node.imageId === previousImageId)
      if (!stillReferenced) {
        await imageService.deleteImage(previousImageId, actedByUserId)
        currentImages.value = currentImages.value.filter((entry) => entry.imageId !== previousImageId)
      }
    }

    return image
  }

  async function removeNodeImage(nodeId, actedByUserId) {
    const existingNode = currentNodes.value.find((node) => node.nodeId === nodeId)
    if (!existingNode?.imageId) return

    const imageId = existingNode.imageId
    await updateNodeInStore(nodeId, { imageId: null, imageAlt: '' })
    await imageService.deleteImage(imageId, actedByUserId)
    currentImages.value = currentImages.value.filter((entry) => entry.imageId !== imageId)
  }

  function getImageMap() {
    return new Map(currentImages.value.map((image) => [image.imageId, image]))
  }

  function hydrateNode(node, imageMap = getImageMap()) {
    const image = node.imageId ? imageMap.get(node.imageId) : null
    return {
      ...node,
      embeddedImageDataUrl: image?.dataUrl || null,
      embeddedImageName: image?.fileName || node.imageAlt || '',
    }
  }

  return {
    diagrams,
    currentDiagram,
    currentNodes,
    currentEdges,
    currentImages,
    selectedNodeIds,
    selectedEdgeIds,
    isDirty,
    loading,
    draftDiagrams,
    publishedDiagrams,
    loadUserDiagrams,
    loadAllDiagrams,
    loadPublishedDiagrams,
    createDiagram,
    openDiagram,
    updateDiagram,
    deleteDiagram,
    transitionStatus,
    closeDiagram,
    addNode,
    updateNodeInStore,
    updateNodeLocal,
    deleteNodeWithEdges,
    restoreNodeWithEdges,
    addEdge,
    updateEdgeInStore,
    deleteEdgeFromStore,
    restoreEdge,
    attachNodeImage,
    removeNodeImage,
    selectNode,
    selectEdge,
    clearSelection,
    selectNodesInRect,
  }
})
