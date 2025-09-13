/**
 * upstream 리포지토리 관리 유틸리티
 * 
 * git submodule 대신 sparse checkout과 partial clone을 사용하여
 * 필요한 localization 파일만 효율적으로 다운로드합니다.
 * 
 * meta.toml 파일에서 모든 설정 정보 (URL, localization 경로)를 읽어옵니다.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { access, mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'pathe'
import { log } from './logger'
import { parseToml } from '../parser/toml'

const execAsync = promisify(exec)

interface UpstreamConfig {
  url: string
  workshop?: string
  path: string
  localizationPaths: string[]
}

interface MetaTomlConfig {
  upstream: {
    url?: string
    workshop?: string
    localization: string[]
    language: string
  }
}

/**
 * meta.toml 파일을 기반으로 upstream 설정을 추출합니다
 */
export async function parseUpstreamConfigs(rootPath: string, targetGameType?: string): Promise<UpstreamConfig[]> {
  const configs: UpstreamConfig[] = []
  
  // meta.toml 파일들을 찾아서 처리
  const metaConfigs = await findMetaTomlConfigs(rootPath, targetGameType)
  configs.push(...metaConfigs)
  
  if (configs.length === 0) {
    const gameMessage = targetGameType ? `${targetGameType} 게임의 ` : ''
    log.error(`${gameMessage}meta.toml 파일이 없습니다. 모든 모드 디렉토리에 meta.toml 파일이 필요합니다.`)
    throw new Error('meta.toml 파일이 없습니다')
  }
  
  return configs
}

/**
 * 모든 meta.toml 파일을 찾아서 upstream 설정을 추출합니다
 */
async function findMetaTomlConfigs(rootPath: string, targetGameType?: string): Promise<UpstreamConfig[]> {
  const configs: UpstreamConfig[] = []
  const gameDirectories = targetGameType ? [targetGameType] : ['ck3', 'vic3', 'stellaris']
  
  for (const gameDir of gameDirectories) {
    const gamePath = join(rootPath, gameDir)
    
    try {
      await access(gamePath)
      const modDirs = await readdir(gamePath, { withFileTypes: true })
      
      for (const modDir of modDirs) {
        if (modDir.isDirectory()) {
          const metaPath = join(gamePath, modDir.name, 'meta.toml')
          
          try {
            await access(metaPath)
            const config = await parseMetaTomlConfig(metaPath, gameDir, modDir.name)
            if (config) {
              configs.push(config)
            }
          } catch {
            log.info(`[${gameDir}/${modDir.name}] meta.toml 파일이 없음`)
          }
        }
      }
    } catch {
      log.info(`[${gameDir}] 게임 디렉토리가 존재하지 않음`)
    }
  }
  
  return configs
}

/**
 * 개별 meta.toml 파일을 파싱하여 upstream 설정을 생성합니다
 */
async function parseMetaTomlConfig(metaPath: string, gameDir: string, modName: string): Promise<UpstreamConfig | null> {
  try {
    const content = await readFile(metaPath, 'utf-8')
    const config = parseToml(content) as MetaTomlConfig
    
    if (!config.upstream?.localization || !Array.isArray(config.upstream.localization)) {
      return null
    }
    
    const upstreamPath = `${gameDir}/${modName}/upstream`
    
    // Steam Workshop ID가 있으면 workshop 우선 처리
    if (config.upstream.workshop) {
      return {
        url: '', // workshop의 경우 빈 URL
        workshop: config.upstream.workshop,
        path: upstreamPath,
        localizationPaths: config.upstream.localization
      }
    }
    
    // meta.toml에서 URL을 직접 읽어옴
    if (!config.upstream.url) {
      log.info(`[${upstreamPath}] meta.toml에 URL 또는 workshop ID가 없음, 일반 파일 기반 upstream으로 처리`)
      return {
        url: '', // 빈 URL로 일반 파일 기반임을 표시
        path: upstreamPath,
        localizationPaths: config.upstream.localization
      }
    }
    
    return {
      url: config.upstream.url,
      path: upstreamPath,
      localizationPaths: config.upstream.localization
    }
  } catch (error) {
    log.warn(`Failed to parse meta.toml: ${metaPath}`, error)
    return null
  }
}

/**
 * Steam Workshop에서 모드를 다운로드합니다
 */
async function downloadFromSteamWorkshop(targetPath: string, config: UpstreamConfig): Promise<void> {
  const startTime = Date.now()
  
  try {
    // 디렉토리 생성
    await mkdir(dirname(targetPath), { recursive: true })
    
    // 이미 다운로드된 경우 건너뛰기 (선택적)
    try {
      await access(targetPath)
      log.info(`[${config.path}] Steam Workshop 모드가 이미 존재함, 업데이트 확인 중...`)
      
      // 기존 모드가 있는 경우 최신 버전 확인을 위해 재다운로드
      // TODO: 더 효율적인 업데이트 체크 로직 추가 가능
    } catch {
      // 파일이 없으면 새로 다운로드
    }
    
    log.start(`[${config.path}] Steam Workshop에서 모드 다운로드 중... (ID: ${config.workshop})`)
    
    // SteamCMD를 사용하여 모드 다운로드
    await downloadWithSteamCMD(targetPath, config.workshop!)
    
    const duration = Date.now() - startTime
    log.success(`[${config.path}] Steam Workshop 다운로드 완료 (${duration}ms)`)
    
  } catch (error) {
    log.error(`[${config.path}] Steam Workshop 다운로드 실패:`, error)
    throw error
  }
}

/**
 * SteamCMD를 사용하여 Steam Workshop 아이템을 다운로드합니다
 */
async function downloadWithSteamCMD(targetPath: string, workshopId: string): Promise<void> {
  // 게임별 앱 ID 매핑 (Workshop 다운로드시 필요)
  const gameAppIds: Record<string, string> = {
    'ck3': '1158310',   // Crusader Kings III
    'vic3': '529340',   // Victoria 3
    'stellaris': '281990' // Stellaris
  }
  
  // 타겟 경로에서 게임 타입 추출 (예: ck3/MOD_NAME/upstream에서 ck3 추출)
  const pathParts = targetPath.split('/')
  const gameType = pathParts.find(part => part in gameAppIds) || 'ck3'
  const appId = gameAppIds[gameType]
  
  // SteamCMD 설치 확인
  try {
    await execAsync('which steamcmd')
  } catch {
    // SteamCMD가 설치되지 않은 경우 설치 시도
    log.info('SteamCMD가 설치되지 않음, 설치 중...')
    await installSteamCMD()
  }
  
  // 임시 디렉토리 생성
  const tempDir = `/tmp/steamcmd-${workshopId}-${Date.now()}`
  await mkdir(tempDir, { recursive: true })
  
  try {
    // SteamCMD 명령어 구성
    // 익명으로 로그인하고 workshop 아이템 다운로드
    const steamcmdCommand = [
      'steamcmd',
      '+login anonymous',
      `+workshop_download_item ${appId} ${workshopId}`,
      '+quit'
    ].join(' ')
    
    log.debug(`SteamCMD 명령어: ${steamcmdCommand}`)
    
    // SteamCMD 실행
    await execAsync(steamcmdCommand, { cwd: tempDir })
    
    // 다운로드된 파일을 타겟 경로로 이동
    const downloadPath = join(tempDir, '.steam', 'steamcmd', 'steamapps', 'workshop', 'content', appId, workshopId)
    
    // 다운로드 경로 확인
    await access(downloadPath)
    
    // 타겟 디렉토리를 삭제하고 다운로드된 내용으로 교체
    try {
      await execAsync(`rm -rf "${targetPath}"`)
    } catch {
      // 타겟이 없으면 무시
    }
    
    await execAsync(`cp -r "${downloadPath}" "${targetPath}"`)
    
    log.success(`Steam Workshop 모드 ${workshopId} 다운로드 완료: ${targetPath}`)
    
  } finally {
    // 임시 디렉토리 정리
    try {
      await execAsync(`rm -rf "${tempDir}"`)
    } catch (error) {
      log.warn(`임시 디렉토리 정리 실패: ${tempDir}`, error)
    }
  }
}

/**
 * SteamCMD 설치
 */
async function installSteamCMD(): Promise<void> {
  try {
    // Ubuntu/Debian 계열에서 SteamCMD 설치
    log.start('SteamCMD 설치 중...')
    
    // 32bit 라이브러리 지원 추가
    await execAsync('dpkg --add-architecture i386')
    await execAsync('apt-get update')
    
    // SteamCMD 설치 (비대화형)
    const installCommand = 'DEBIAN_FRONTEND=noninteractive apt-get install -y steamcmd'
    await execAsync(installCommand)
    
    // steamcmd 링크 생성 (보통 /usr/games/steamcmd에 설치됨)
    try {
      await execAsync('ln -sf /usr/games/steamcmd /usr/local/bin/steamcmd')
    } catch {
      // 링크 생성 실패는 무시 (이미 존재할 수 있음)
    }
    
    log.success('SteamCMD 설치 완료')
    
  } catch (error) {
    log.error('SteamCMD 설치 실패:', error)
    throw new Error(`SteamCMD 설치에 실패했습니다. 수동으로 설치해주세요: ${error}`)
  }
}


/**
 * 효율적인 방식으로 upstream 리포지토리를 클론하거나 Steam Workshop에서 다운로드하고 localization 파일만 체크아웃합니다
 */
export async function updateUpstreamOptimized(config: UpstreamConfig, rootPath: string): Promise<void> {
  const fullPath = join(rootPath, config.path)
  
  // Steam Workshop 모드인 경우
  if (config.workshop) {
    log.info(`[${config.path}] Steam Workshop 모드 (ID: ${config.workshop})`)
    await downloadFromSteamWorkshop(fullPath, config)
    return
  }
  
  // git 기반이 아닌 일반 파일 업스트림인 경우 건너뛰기
  if (!config.url) {
    log.info(`[${config.path}] 일반 파일 기반 upstream, git 업데이트 건너뛰기`)
    return
  }
  
  try {
    // 이미 존재하는지 확인
    await access(fullPath)
    log.info(`[${config.path}] 이미 존재함, 업데이트 확인 중...`)
    await updateExistingRepository(fullPath, config)
  } catch {
    log.info(`[${config.path}] 새로 클론 중...`)
    await cloneOptimizedRepository(fullPath, config)
  }
}

/**
 * 새 리포지토리를 효율적으로 클론합니다
 */
async function cloneOptimizedRepository(targetPath: string, config: UpstreamConfig): Promise<void> {
  const startTime = Date.now()
  
  // 디렉토리 생성
  await mkdir(dirname(targetPath), { recursive: true })
  
  try {
    // 1. Partial clone (blob 없이 메타데이터만)
    log.start(`[${config.path}] Partial clone 시작...`)
    await execAsync(`git clone --filter=blob:none --no-checkout "${config.url}" "${targetPath}"`)
    
    // 2. Sparse checkout 설정
    log.start(`[${config.path}] Sparse checkout 설정 중...`)
    await execAsync('git sparse-checkout init', { cwd: targetPath })
    
    // 3. Localization 경로만 설정 (파일에 직접 작성)
    const sparseCheckoutPath = join(targetPath, '.git', 'info', 'sparse-checkout')
    const sparseCheckoutContent = config.localizationPaths.join('\n')
    await writeFile(sparseCheckoutPath, sparseCheckoutContent)
    
    // 4. 최신 버전 태그를 체크아웃하거나 기본 브랜치의 최신 커밋을 가져옴
    log.start(`[${config.path}] 최신 버전 확인 중...`)
    await checkoutLatestVersion(targetPath, config.path)
    
    const duration = Date.now() - startTime
    log.success(`[${config.path}] 클론 완료 (${duration}ms)`)
    
  } catch (error) {
    log.error(`[${config.path}] 클론 실패:`, error)
    throw error
  }
}

/**
 * 기존 리포지토리를 업데이트합니다
 */
async function updateExistingRepository(repositoryPath: string, config: UpstreamConfig): Promise<void> {
  try {
    // Git 상태 확인
    const { stdout: status } = await execAsync('git status --porcelain', { cwd: repositoryPath })
    
    if (status.trim()) {
      log.warn(`[${config.path}] 로컬 변경사항이 있어 업데이트를 건너뜁니다`)
      return
    }
    
    // 원격 변경사항 및 태그 가져오기 (원본 워크플로우와 동일)
    log.start(`[${config.path}] 태그 및 원격 변경사항 가져오는 중...`)
    await execAsync('git fetch --tags', { cwd: repositoryPath })
    
    // 최신 버전 확인 및 체크아웃
    log.start(`[${config.path}] 업데이트 중...`)
    await checkoutLatestVersion(repositoryPath, config.path)
    log.success(`[${config.path}] 업데이트 완료`)
    
  } catch (error) {
    log.error(`[${config.path}] 업데이트 실패:`, error)
    throw error
  }
}

/**
 * 최신 버전 태그를 체크아웃하거나, 태그가 없는 경우 기본 브랜치의 최신 커밋을 가져옵니다
 * 원본 워크플로우 로직을 정확히 복제합니다
 */
async function checkoutLatestVersion(repositoryPath: string, configPath: string): Promise<void> {
  log.info(`[${configPath}] 버전 확인 중...`)
  
  try {
    // 1. 태그가 있는지 확인 (원본 워크플로우와 동일한 방식)
    await execAsync('git tag | grep -q .', { cwd: repositoryPath })
    
    // 태그가 있는 경우, 최신 태그로 체크아웃
    log.info(`[${configPath}] 태그 발견, 최신 태그 사용`)
    const { stdout: latestTag } = await execAsync('git describe --tags `git rev-list --tags --max-count=1`', { cwd: repositoryPath })
    const tag = latestTag.trim()
    log.info(`[${configPath}] 최신 태그: ${tag}`)
    await execAsync(`git checkout ${tag}`, { cwd: repositoryPath })
    
  } catch {
    // 2. 태그가 없는 경우에만 기본 브랜치의 최신 커밋을 가져옴
    log.info(`[${configPath}] 태그 없음, 기본 브랜치 사용`)
    
    try {
      const { stdout: defaultBranch } = await execAsync('git remote show origin | grep "HEAD branch" | awk \'{print $NF}\'', { cwd: repositoryPath })
      const branch = defaultBranch.trim()
      log.info(`[${configPath}] 기본 브랜치: ${branch}`)
      await execAsync(`git checkout ${branch}`, { cwd: repositoryPath })
      await execAsync(`git pull origin ${branch}`, { cwd: repositoryPath })
    } catch (error) {
      log.error(`[${configPath}] 기본 브랜치 체크아웃 실패:`, error)
      throw error
    }
  }
}

/**
 * 모든 upstream 리포지토리를 병렬로 업데이트합니다
 */
export async function updateAllUpstreams(rootPath: string, targetGameType?: string): Promise<void> {
  const configs = await parseUpstreamConfigs(rootPath, targetGameType)
  
  if (configs.length === 0) {
    const gameMessage = targetGameType ? `${targetGameType} 게임의 ` : ''
    log.warn(`업데이트할 ${gameMessage}upstream 설정을 찾을 수 없습니다`)
    return
  }
  
  const scopeMessage = targetGameType ? `${targetGameType.toUpperCase()} 게임` : '모든 게임'
  log.box(`
    Upstream 최적화 업데이트 시작
    - 범위: ${scopeMessage}
    - 대상: ${configs.length}개 리포지토리
    - 모드: 병렬 처리 (sparse checkout)
    - 설정 소스: meta.toml 전용
  `)
  
  const startTime = Date.now()
  
  // 병렬 처리
  const promises = configs.map(config => updateUpstreamOptimized(config, rootPath))
  await Promise.all(promises)
  
  const duration = Date.now() - startTime
  const scopeMessageComplete = targetGameType ? `${targetGameType.toUpperCase()} ` : '모든 '
  log.success(`${scopeMessageComplete}upstream 업데이트 완료! (${duration}ms)`)
}