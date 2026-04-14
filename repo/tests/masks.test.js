import { describe, it, expect } from 'vitest'
import { maskDisplayName } from '../src/utils/masks'

describe('maskDisplayName', () => {
  it('masks single word name', () => {
    const result = maskDisplayName('Alice')
    expect(result).toBe('A****')
  })

  it('masks multi-word name', () => {
    const result = maskDisplayName('John Smith')
    expect(result).toBe('J*** S****')
    // Each word: first char + at least 3 asterisks
    const parts = result.split(' ').filter(Boolean)
    expect(parts.length).toBe(2)
    expect(parts[0][0]).toBe('J')
    expect(parts[1][0]).toBe('S')
  })

  it('handles empty input', () => {
    expect(maskDisplayName('')).toBe('****')
    expect(maskDisplayName(null)).toBe('****')
    expect(maskDisplayName(undefined)).toBe('****')
  })

  it('handles single character name', () => {
    const result = maskDisplayName('A')
    expect(result[0]).toBe('A')
    expect(result.length).toBe(4) // A + 3 asterisks minimum
  })
})
