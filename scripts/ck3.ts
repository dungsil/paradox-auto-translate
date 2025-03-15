import { readdir } from 'node:fs/promises'
import { join } from 'pathe'
import { processModTranslations } from './factory/translate'
import { log } from './utils/logger'

async function main () {
  try {
    const ck3Dir = join(import.meta.dirname, '..', 'ck3')
    const mods = await readdir(ck3Dir)

    log.box(
      `
      CK3 번역 스크립트 구동
      - 번역 대상 경로: ${ck3Dir}
      - 번역 대상 모드 (${mods.length}개): ${mods}
      `,
    )

    await processModTranslations({
      rootDir: ck3Dir,
      mods,
    })

    log.success(`번역 완료! 스크립트를 종료합니다. (처리된 모드: ${mods})`)
  } catch (error) {
    log.error('번역 도중 오류가 발생하였습니다.', error)
    process.exit(1)
  }
}

main()
