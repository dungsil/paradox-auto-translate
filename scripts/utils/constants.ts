import dotenv from 'dotenv'
import { resolve } from 'pathe'

dotenv.config({
  path: resolve(import.meta.dirname, '../../.env'),
})

// 루트 디렉토리
export const ROOT_DIR = resolve(import.meta.dirname, '../../')

// UTF-8 BOM
export const UTF8_BOM = '\uFEFF'
