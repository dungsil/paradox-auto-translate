import { delay } from './delay'
import { log } from './logger'

const translationQueue: Array<() => Promise<void>> = []

const MAX_RETRIES = 5
const RETRY_DELAYS = [0, 1_000, 2_000, 8_000, 10_000, 60_000] // 밀리초 단위
const RATE_LIMIT_INTERVAL = 250 // 250ms = 초당 4개 요청

let lastRequestTime = 0
let isProcessing = false

export async function addQueue (newQueue: () => Promise<void>) {
  translationQueue.push(newQueue)

  // 이미 처리 중이 아닐 때만 새로운 처리 시작
  if (!isProcessing) {
    processQueue()
  }
}

async function processQueue () {
  isProcessing = true
  
  while (translationQueue.length > 0) {
    // 레이트 리미팅 확인
    const now = Date.now()
    const timeSinceLastRequest = now - lastRequestTime
    if (timeSinceLastRequest < RATE_LIMIT_INTERVAL) {
      await delay(RATE_LIMIT_INTERVAL - timeSinceLastRequest)
    }

    const task = translationQueue.shift()
    if (task) {
      lastRequestTime = Date.now()
      await executeTaskWithRetry(task)
    }
  }
  
  isProcessing = false
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
