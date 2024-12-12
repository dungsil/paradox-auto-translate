import { readFile } from 'node:fs/promises'
import { join } from 'pathe'
import toml from 'toml'
import { log } from './logging'

// 번역 대상 언어
export type Language = 'english' | 'korean'

// 소스 언어
export type UpstreamLanguage = Omit<Language, 'korean'>

export interface Meta {
  /** 업스트림 메타정보 */
  upstream: {

    /** 저장소 내 localization 경로 */
    localization: string

    /** 원본 언어 */
    language: UpstreamLanguage
  }
}

// 모드 별 메타정보를 가져오는 함수
export async function loadMeta (modDir: string) {
  const metaPath = join(modDir, 'meta.toml')

  let meta: Meta
  try {
    const metaStrings = await readFile(metaPath, { encoding: 'utf-8' })
    meta = toml.parse(metaStrings)
    log.verbose(`Loaded meta from ${metaPath}`)
  } catch (e) {
    log.warn(`Failed to load meta from ${metaPath}`, e)

    meta = {
      upstream: {
        language: 'english',
        localization: 'localization/english',
      },
    }
  }

  log.verbose('Meta: ', JSON.stringify(meta))
  return meta
}
