import { delay } from './delay'
import { log } from './logger'

const translationQueue: Array<() => Promise<void>> = []

const MAX_RETRIES = 5
const RETRY_DELAYS = [0, 1_000, 2_000, 8_000, 10_000, 60_000] // 밀리초 단위

let lastRequestTime = 0

export async function addQueue (newQueue: () => Promise<void>) {
  translationQueue.push(newQueue)

  processQueue()
}

async function processQueue () {
  // 큐가 없으면 종료
  if (translationQueue.length === 0) {
    return
  }

  // 초당 최대 1개까지만 요청을 보낼 수 있도록 제한
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < 1000) {
    setTimeout(processQueue, 1000 - timeSinceLastRequest)
    return
  }

  const task = translationQueue.shift()
  if (task) {
    lastRequestTime = now
    await executeTaskWithRetry(task)

    // 처리 완료후 세로운 큐 실행
    processQueue()
  }
}

async function executeTaskWithRetry (task: () => Promise<void>, retryCount = 0): Promise<void> {
  try {
    await task()
  } catch (error) {
    const message = (error as Error).message
    if (message) {
      if (!message.includes('429 Too Many Requests')) {
        log.warn('요청 실패:', (error as Error).message)
        log.debug('\t', error)
      }
    }

    if (retryCount < MAX_RETRIES) {
      log.info(`요청에 실패하여 잠시후 다시 시도합니다. (${retryCount + 1})`)

      // 지수 백오프
      const retryDelay = RETRY_DELAYS[retryCount + 1]
      await delay(retryDelay)

      // 재시도
      return executeTaskWithRetry(task, retryCount + 1)
    } else {
      log.error('재시도 횟수가 초과되어 종료됩니다:', error)
      throw error
    }
  }
}
