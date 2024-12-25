import { log } from './logger'

const translationQueue: Array<() => Promise<void>> = []

const MAX_RETRIES = 5
const RETRY_DELAYS = [0, 1000, 2000, 4000, 8000, 16000] // 밀리초 단위

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

  // 초당 최대 5개까지만 요청을 보낼 수 있도록 제한
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < 200) {
    setTimeout(processQueue, 200 - timeSinceLastRequest)
    // return
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
    if (retryCount < MAX_RETRIES) {
      log.debug(`요청 ${retryCount + 1}번째 재시도`)

      // 지수 백오프
      const delay = RETRY_DELAYS[retryCount + 1]
      await new Promise(resolve => setTimeout(resolve, delay))

      // 재시도
      return executeTaskWithRetry(task, retryCount + 1)
    } else {
      log.error('재시도 횟수가 초과되어 종료됩니다:', error)
      throw error
    }
  }
}
