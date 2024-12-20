import crypto from 'node:crypto'

export function hash (content: string) {
  return crypto.createHash('sha1')
    .update(content)
    .digest('hex')
}
