import process from 'node:process'
import { readdir } from 'node:fs/promises'
import { join } from 'pathe'
import { processModTranslations } from './factory/translate'
import { invalidateDictionaryTranslations } from './utils/dictionary-invalidator'
import { log } from './utils/logger'

async function main () {
  try {
    const stellarisDir = join(import.meta.dirname, '..', 'stellaris')
    const mods = await readdir(stellarisDir)
    const onlyHash = process.argv?.[2] === 'onlyHash'
    const updateDict = process.argv?.[2] === 'updateDict'

    if (updateDict) {
      log.box(
        `
        Stellaris 단어사전 기반 번역 무효화
        - 대상 경로: ${stellarisDir}
        - 대상 모드 (${mods.length}개): ${mods}
        `,
      )
      
      await invalidateDictionaryTranslations('stellaris', stellarisDir)
      
      log.success(`단어사전 기반 번역 무효화 완료!`)
    } else {
      log.box(
        `
        Stellaris 번역 스크립트 구동
        - 번역 대상 경로: ${stellarisDir}
        - 번역 대상 모드 (${mods.length}개): ${mods}
        `,
      )

      await processModTranslations({
        rootDir: stellarisDir,
        mods,
        gameType: 'stellaris',
        onlyHash
      })

      log.success(`번역 완료! 스크립트를 종료합니다. (처리된 모드: ${mods})`)
    }
  } catch (error) {
    throw new Error(`Stellaris 번역 처리 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error
    })
  }
}

main().catch((error) => {
  log.error('번역 도중 오류가 발생하였습니다.', error)
  process.exit(1)
})