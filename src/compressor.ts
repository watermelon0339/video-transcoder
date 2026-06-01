import logger from '@adonisjs/core/services/logger'
import FfmpegBase from './lib/ffmpeg_base.js'
import { resolveFfmpegBackend } from './lib/gpu_resolver.js'
import Progress from './lib/progress.js'
import QueuedFile from './lib/queued_file.js'
import { resolutions, Resolutions } from './lib/resolutions.js'

export default class Compressor extends FfmpegBase {
  declare source: string
  declare item: QueuedFile

  constructor(source: string, item: QueuedFile) {
    super()

    this.source = source
    this.item = item
  }

  async run() {
    logger.info('Compressing ...')
    return this.#compress()
  }

  async #compress(): Promise<string | null> {
    const output = [this.item.destination, 'video.mp4'].join('/')
    const resolution = this.#getMaxResolution()
    const { height } = resolutions.get(resolution) ?? {}

    return new Promise((resolve) => {
      const progress = new Progress('Compressing')
      const resolvedBackend = resolveFfmpegBackend()
      const outputOptions = ['-tag:v', 'hvc1']

      if (resolvedBackend.backend === 'cpu') {
        outputOptions.unshift(
          '-x265-params',
          'profile=main10',
          '-crf',
          '26',
          '-preset',
          'fast',
          '-filter:v',
          `scale=-2:${height}`
        )
      }

      if (resolvedBackend.backend === 'nvidia') {
        outputOptions.unshift('-cq', '27', '-preset', 'p4', '-filter:v', `scale=-2:${height}`)
      }

      if (resolvedBackend.backend === 'apple') {
        outputOptions.unshift('-q:v', '75', '-filter:v', `scale=-2:${height}`)
      }

      if (resolvedBackend.backend === 'amd') {
        outputOptions.unshift(
          '-vf',
          `format=nv12,hwupload,scale_vaapi=-2:${height}`,
          '-rc_mode',
          'VBR',
          '-qp',
          '26'
        )
      }

      const command = this.ffmpeg(this.source)
        .output(output)
        .videoCodec(resolvedBackend.encoders.compressor)
        .audioCodec('aac')
        .audioBitrate('148k')
        .outputOptions(outputOptions)

      progress.start()

      command.on('progress', (event) => progress.update(event.percent))
      command.on('error', (err) => this.onFfmpegError(err, resolve))

      command.on('end', async () => {
        progress.update(100)
        resolve(output)
      })

      command.run()
    })
  }

  #getMaxResolution() {
    const resnumbers = this.resolutions.map((res) => Number(res))
    return this.resolutions.length
      ? (Math.max(...resnumbers).toString() as Resolutions)
      : Resolutions.P2160
  }
}
