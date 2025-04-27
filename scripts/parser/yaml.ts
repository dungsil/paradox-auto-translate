export function parseYaml (content: string): Record<string, Record<string, [string, string | null]>> {
  const lines = content.split('\n')
  const parsedContent: Record<string, Record<string, [string, string | null]>> = {}
  let currentKey = ''

  for (const line of lines) {
    if (line.trim().startsWith('#')) continue // Skip comments

    const keyMatch = line.match(/^(\s*)?(.+?):\s*(\d+)?\s*(.*)$/)

    if (keyMatch) {
      const [, , key, , value] = keyMatch

      if (!currentKey) {
        currentKey = key
        parsedContent[currentKey] = {}
      } else {
        const [text, comment] = parseYamlValue(value)
        if (text !== '') {
          parsedContent[currentKey][key] = [text, comment]
        }
      }
    }
  }

  return parsedContent
}

function parseYamlValue (value: string): [string, string | null] {
  const [, text, comment] = /^"(.+)"(?:\s+)?(?:#(?:\s+)?(.+))?$/.exec(value) || []

  // console.log(`Parsed value: ${text} | ${comment}`)

  // If the text is empty, return empty string
  if (!text) {
    return ['', null]
  }

  return [text.trim(), comment || null]
}

export function stringifyYaml (data: Record<string, Record<string, [string, string | null]>>): string {
  let result = ''

  for (const [topKey, topValue] of Object.entries(data)) {
    result += `\uFEFF${topKey}:\n` // '\uFEFF' : UTF-8 BOM

    for (const [key, [translatedText, hash]] of Object.entries(topValue)) {
      if (translatedText === null) {
        result += '\n'
        continue
      }

      const encodedTranslatedText = translatedText.replaceAll(/((?<!\\)(\\\\)*)"/g, '$1\\"')
      result += `  ${key}: "${encodedTranslatedText}" # ${hash}\n`
    }

  }
  return result
}
