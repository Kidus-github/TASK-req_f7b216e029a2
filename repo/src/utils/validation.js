export const USERNAME_MIN = 3
export const USERNAME_MAX = 50
export const PASSWORD_MIN = 8
export const REALNAME_MAX = 120
export const ORG_MAX = 120
export const DIAGRAM_TITLE_MAX = 200
export const DIAGRAM_DESC_MAX = 1000
export const NODE_NAME_MAX = 120
export const NODE_DESC_MAX = 280
export const NODE_TAG_MAX = 80
export const REVIEWER_NAME_MAX = 120

export function validateUsername(username) {
  if (!username || typeof username !== 'string') return 'Username is required.'
  const trimmed = username.trim()
  if (trimmed.length < USERNAME_MIN) return `Username must be at least ${USERNAME_MIN} characters.`
  if (trimmed.length > USERNAME_MAX) return `Username must be at most ${USERNAME_MAX} characters.`
  return null
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string') return 'Password is required.'
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`
  return null
}

export function validateRealName(name) {
  if (name && name.length > REALNAME_MAX) return `Real name must be at most ${REALNAME_MAX} characters.`
  return null
}

export function validateOrganization(org) {
  if (org && org.length > ORG_MAX) return `Organization must be at most ${ORG_MAX} characters.`
  return null
}

export function validateDiagramTitle(title) {
  if (!title || typeof title !== 'string' || title.trim().length === 0) return 'Title is required.'
  if (title.length > DIAGRAM_TITLE_MAX) return `Title must be at most ${DIAGRAM_TITLE_MAX} characters.`
  return null
}

export function validateDiagramDescription(desc) {
  if (desc && desc.length > DIAGRAM_DESC_MAX) return `Description must be at most ${DIAGRAM_DESC_MAX} characters.`
  return null
}
