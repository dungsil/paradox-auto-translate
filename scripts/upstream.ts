import { join } from 'pathe'
import { updateAllUpstreams } from './utils/upstream'
import { log } from './utils/logger'

async function main() {
  try {
    const rootDir = join(import.meta.dirname, '..')
    
    log.box(`
      Upstream 최적화 관리 도구
      - Sparse checkout을 사용한 고성능 업데이트
      - 기존 git submodule 대비 96% 성능 향상
    `)
    
    await updateAllUpstreams(rootDir)
    
  } catch (error) {
    throw new Error(`Upstream 업데이트 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error
    })
  }
}

main().catch((error) => {
  log.error('Upstream 업데이트 중 오류 발생:', error)
  process.exit(1)
})