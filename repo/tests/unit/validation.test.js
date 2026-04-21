import { describe, it, expect } from 'vitest'
import {
  validateUsername,
  validatePassword,
  validateRealName,
  validateOrganization,
  validateDiagramTitle,
  validateDiagramDescription,
} from '@/utils/validation'

describe('validateUsername', () => {
  it('rejects empty username', () => {
    expect(validateUsername('')).toBeTruthy()
    expect(validateUsername(null)).toBeTruthy()
    expect(validateUsername(undefined)).toBeTruthy()
  })

  it('rejects username shorter than 3 chars', () => {
    expect(validateUsername('ab')).toContain('at least 3')
  })

  it('rejects username longer than 50 chars', () => {
    expect(validateUsername('a'.repeat(51))).toContain('at most 50')
  })

  it('accepts valid username', () => {
    expect(validateUsername('alice')).toBeNull()
    expect(validateUsername('bob123')).toBeNull()
    expect(validateUsername('a'.repeat(50))).toBeNull()
  })
})

describe('validatePassword', () => {
  it('rejects empty password', () => {
    expect(validatePassword('')).toBeTruthy()
    expect(validatePassword(null)).toBeTruthy()
  })

  it('rejects password shorter than 8 chars', () => {
    expect(validatePassword('short')).toContain('at least 8')
  })

  it('accepts valid password', () => {
    expect(validatePassword('password123')).toBeNull()
    expect(validatePassword('12345678')).toBeNull()
  })
})

describe('validateRealName', () => {
  it('accepts empty/null', () => {
    expect(validateRealName('')).toBeNull()
    expect(validateRealName(null)).toBeNull()
  })

  it('rejects over 120 chars', () => {
    expect(validateRealName('a'.repeat(121))).toContain('at most 120')
  })
})

describe('validateOrganization', () => {
  it('accepts empty', () => {
    expect(validateOrganization('')).toBeNull()
  })

  it('rejects over 120 chars', () => {
    expect(validateOrganization('x'.repeat(121))).toContain('at most 120')
  })
})

describe('validateDiagramTitle', () => {
  it('rejects empty title', () => {
    expect(validateDiagramTitle('')).toBeTruthy()
    expect(validateDiagramTitle('   ')).toBeTruthy()
  })

  it('rejects title over 200 chars', () => {
    expect(validateDiagramTitle('a'.repeat(201))).toContain('at most 200')
  })

  it('accepts valid title', () => {
    expect(validateDiagramTitle('My SOP')).toBeNull()
  })
})

describe('validateDiagramDescription', () => {
  it('accepts empty', () => {
    expect(validateDiagramDescription('')).toBeNull()
  })

  it('rejects over 1000 chars', () => {
    expect(validateDiagramDescription('a'.repeat(1001))).toContain('at most 1000')
  })
})
