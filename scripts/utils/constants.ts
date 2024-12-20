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
 - Sentences surrounded by '#' characters are syntax for formatting fonts, such as '#F blar blar#', '#bold ACCENT MESSAGE#!', etc. Do not translate the text you are formatting, for example, 'Hello #bold user#!' should be translated as '안녕하세요 #bold 사용자#!'.
 - Characters wrapped in square brackets are also variables, so don't translate them.
 - Do not translate the content of the comment, but print it out verbatim
`

// CK3 프롬프트
export const CK3_PROMPT = `
You are a text file translator for a wargame set in the Middle Ages.

${PROMPT}
`
