const PNG_MAX_EDGE = 8000

self.onmessage = async function (e) {
  const { svgData, width: rawWidth, height: rawHeight, scale } = e.data

  try {
    let width = rawWidth * scale
    let height = rawHeight * scale

    const longest = Math.max(width, height)
    if (longest > PNG_MAX_EDGE) {
      const ratio = PNG_MAX_EDGE / longest
      width *= ratio
      height *= ratio
    }

    const offscreen = new OffscreenCanvas(Math.round(width), Math.round(height))
    const ctx = offscreen.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const bitmap = await createImageBitmap(blob, {
      resizeWidth: Math.round(width),
      resizeHeight: Math.round(height),
    })
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()

    const resultBlob = await offscreen.convertToBlob({ type: 'image/png' })
    const buffer = await resultBlob.arrayBuffer()
    self.postMessage({ ok: true, buffer, width: Math.round(width), height: Math.round(height) }, [buffer])
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || 'PNG export failed in worker.' })
  }
}
