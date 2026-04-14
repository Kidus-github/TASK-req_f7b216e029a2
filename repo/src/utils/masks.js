export function maskDisplayName(name) {
  if (!name || typeof name !== 'string') return '****'
  return name
    .split(/\s+/)
    .map((word) => {
      if (word.length === 0) return ''
      return word[0] + '*'.repeat(Math.max(word.length - 1, 3))
    })
    .join(' ')
}
