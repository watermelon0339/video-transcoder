import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { spawnSync } from 'node:child_process'
import { platform } from 'node:os'

type GpuMode = 'auto' | 'cpu' | 'nvidia' | 'amd' | 'apple-m' | 'apple-intel'
type Backend = 'cpu' | 'nvidia' | 'amd' | 'apple'

type EncoderPair = {
  transcoder: string
  compressor: string
}

type ResolveResult = {
  requestedMode: GpuMode
  backend: Backend
  encoders: EncoderPair
  fallback: boolean
  reason: string
}

const CPU_ENCODERS: EncoderPair = {
  transcoder: 'libx264',
  compressor: 'libx265',
}

const BACKEND_ENCODERS: Record<Exclude<Backend, 'cpu'>, EncoderPair> = {
  nvidia: { transcoder: 'h264_nvenc', compressor: 'hevc_nvenc' },
  apple: { transcoder: 'h264_videotoolbox', compressor: 'hevc_videotoolbox' },
  amd: { transcoder: 'h264_vaapi', compressor: 'hevc_vaapi' },
}

let cachedFfmpegEncoders: Set<string> | null = null
let cachedResolvedBackend: ResolveResult | null = null

function loadFfmpegEncoders() {
  if (cachedFfmpegEncoders) {
    return cachedFfmpegEncoders
  }

  const proc = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], {
    encoding: 'utf-8',
  })

  const output = `${proc.stdout ?? ''}\n${proc.stderr ?? ''}`
  const found = output
    .split('\n')
    .map((line) => line.trim().split(/\s+/).at(1) ?? '')
    .filter(Boolean)

  cachedFfmpegEncoders = new Set(found)
  return cachedFfmpegEncoders
}

function supportsEncoder(name: string) {
  return loadFfmpegEncoders().has(name)
}

function hasAmdRenderNode() {
  const proc = spawnSync('test', ['-e', '/dev/dri/renderD128'])
  return proc.status === 0
}

function resolveCpu(requestedMode: GpuMode, reason: string): ResolveResult {
  return {
    requestedMode,
    backend: 'cpu',
    encoders: CPU_ENCODERS,
    fallback: requestedMode !== 'cpu',
    reason,
  }
}

function resolveExplicitMode(mode: Exclude<GpuMode, 'auto'>): ResolveResult {
  if (mode === 'cpu') {
    return resolveCpu(mode, 'GPU mode is forced to CPU')
  }

  const backend: Backend = mode === 'nvidia' ? 'nvidia' : mode === 'amd' ? 'amd' : 'apple'

  const encoders = BACKEND_ENCODERS[backend]
  const transcoderSupported = supportsEncoder(encoders.transcoder)
  const compressorSupported = supportsEncoder(encoders.compressor)

  if (backend === 'amd' && !hasAmdRenderNode()) {
    return resolveCpu(mode, 'AMD requested but /dev/dri/renderD128 is not available')
  }

  if (!transcoderSupported || !compressorSupported) {
    return resolveCpu(mode, `Requested ${backend} backend is not available in ffmpeg encoders`)
  }

  return {
    requestedMode: mode,
    backend,
    encoders,
    fallback: false,
    reason: `Using requested ${backend} backend`,
  }
}

function resolveAutoMode(): ResolveResult {
  const hostPlatform = platform()

  if (hostPlatform === 'darwin') {
    const encoders = BACKEND_ENCODERS.apple

    if (supportsEncoder(encoders.transcoder) && supportsEncoder(encoders.compressor)) {
      return {
        requestedMode: 'auto',
        backend: 'apple',
        encoders,
        fallback: false,
        reason: 'Detected macOS and available VideoToolbox encoders',
      }
    }

    return resolveCpu('auto', 'Detected macOS but VideoToolbox encoders were not available')
  }

  if (hostPlatform === 'linux') {
    const nvidia = BACKEND_ENCODERS.nvidia
    const amd = BACKEND_ENCODERS.amd

    if (supportsEncoder(nvidia.transcoder) && supportsEncoder(nvidia.compressor)) {
      return {
        requestedMode: 'auto',
        backend: 'nvidia',
        encoders: nvidia,
        fallback: false,
        reason: 'Detected Linux/WSL and available NVENC encoders',
      }
    }

    if (supportsEncoder(amd.transcoder) && supportsEncoder(amd.compressor) && hasAmdRenderNode()) {
      return {
        requestedMode: 'auto',
        backend: 'amd',
        encoders: amd,
        fallback: false,
        reason: 'Detected Linux and available VAAPI encoders + render node',
      }
    }

    return resolveCpu('auto', 'Detected Linux/WSL but no supported hardware encoder backend')
  }

  return resolveCpu('auto', `No hardware profile for platform ${hostPlatform}`)
}

function resolveBackendInternal(): ResolveResult {
  const mode = env.get('GPU') as GpuMode

  if (mode === 'auto') {
    return resolveAutoMode()
  }

  return resolveExplicitMode(mode)
}

export function resolveFfmpegBackend() {
  if (!cachedResolvedBackend) {
    cachedResolvedBackend = resolveBackendInternal()

    logger.info(
      `[gpu]: mode=${cachedResolvedBackend.requestedMode}; backend=${cachedResolvedBackend.backend}; transcoder=${cachedResolvedBackend.encoders.transcoder}; compressor=${cachedResolvedBackend.encoders.compressor}; fallback=${cachedResolvedBackend.fallback}; reason=${cachedResolvedBackend.reason}`
    )
  }

  return cachedResolvedBackend
}
