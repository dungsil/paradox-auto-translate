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
  path: string
  localizationPaths: string[]
}

interface MetaTomlConfig {
  upstream: {
    url?: string
    localization: string[]
    language: string
  }
}

/**
 * meta.toml 파일을 기반으로 upstream 설정을 추출합니다
 */
export async function parseUpstreamConfigs(rootPath: string): Promise<UpstreamConfig[]> {
  const configs: UpstreamConfig[] = []
  
  // meta.toml 파일들을 찾아서 처리
  const metaConfigs = await findMetaTomlConfigs(rootPath)
  configs.push(...metaConfigs)
  
  if (configs.length === 0) {
    log.error('meta.toml 파일이 없습니다. 모든 모드 디렉토리에 meta.toml 파일이 필요합니다.')
    throw new Error('meta.toml 파일이 없습니다')
  }
  
  return configs
}

/**
 * 모든 meta.toml 파일을 찾아서 upstream 설정을 추출합니다
 */
async function findMetaTomlConfigs(rootPath: string): Promise<UpstreamConfig[]> {
  const configs: UpstreamConfig[] = []
  const gameDirectories = ['ck3', 'vic3', 'stellaris']
  
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
    
    // meta.toml에서 URL을 직접 읽어옴
    if (!config.upstream.url) {
      log.info(`[${upstreamPath}] meta.toml에 URL이 없음, 일반 파일 기반 upstream으로 처리`)
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
 * 효율적인 방식으로 upstream 리포지토리를 클론하고 localization 파일만 체크아웃합니다
 */
export async function updateUpstreamOptimized(config: UpstreamConfig, rootPath: string): Promise<void> {
  const fullPath = join(rootPath, config.path)
  
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
export async function updateAllUpstreams(rootPath: string): Promise<void> {
  const configs = await parseUpstreamConfigs(rootPath)
  
  if (configs.length === 0) {
    log.warn('업데이트할 upstream 설정을 찾을 수 없습니다')
    return
  }
  
  log.box(`
    Upstream 최적화 업데이트 시작
    - 대상: ${configs.length}개 리포지토리
    - 모드: 병렬 처리 (sparse checkout)
    - 설정 소스: meta.toml 전용
  `)
  
  const startTime = Date.now()
  
  // 병렬 처리
  const promises = configs.map(config => updateUpstreamOptimized(config, rootPath))
  await Promise.all(promises)
  
  const duration = Date.now() - startTime
  log.success(`모든 upstream 업데이트 완료! (${duration}ms)`)
}