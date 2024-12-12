import * as constants from 'node:constants'
import { access } from 'node:fs/promises'

export async function exists (path: string) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch (e) {
    return false
  }
}

export async function notExists (path: string) {
  return !(await exists(path))
}
