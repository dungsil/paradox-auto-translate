import { resolve } from 'pathe'

// 루트 디렉토리
export const ROOT_DIR = resolve(import.meta.dirname, '../../')

// UTF-8 BOM
export const UTF8_BOM = '\uFEFF'

// 프롬프트
export const PROMPT = `
Translate and output the value entered by the user to Korean

Please consider the following when responding:
 - NOTHING should be responded to except the translated text.
 - Values wrapped in '$', '£' characters mean that they are variables, so don't translate them.
 - Formulas for formatting the font when surrounded by '#' within a sentence, such as '#F Hello #', '#bold SUPER ACCENT#', '#italic Why#?', etc.
 - Characters wrapped in square brackets are also variables, so don't translate them.
 - Do not translate the content of the comment, but print it out verbatim
`

// CK3 프롬프트
export const CK3_PROMPT = `
You are a text file translator for a wargame set in the Middle Ages.

${PROMPT}
`
