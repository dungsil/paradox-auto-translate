export type Mode = 'ck3' | 'vic3' | 'stellaris'

const dictionaries: Record<string, string> = {
  xxxxx: 'xxxxx',
}

export async function translate (text: string | null, mode: Mode): Promise<string | null> {
  if (text === null) {
    return null
  }

  if (text.trim() === '') {
    return ''
  }

  if (dictionaries.includes(text)) {
    return dictionaries[text]
  }
}
