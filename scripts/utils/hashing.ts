import { createHash } from 'node:crypto'

export function hashing (data: string) {
  return createHash('sha1').update(data).digest('hex')
}
