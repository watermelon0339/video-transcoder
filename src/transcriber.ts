import { replacements } from '#config/replacements'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import Progress from './lib/progress.js'
import QueuedFile from './lib/queued_file.js'
import { resolveFfmpegBackend } from './lib/gpu_resolver.js'

export default class Transcriber {
  declare source: string
  declare item: QueuedFile

  success = false

  constructor(source: string, item: QueuedFile) {
    this.source = source
    this.item = item
  }

  async run() {
    logger.info('Transcribing audio ...')
    return this.#transcribe()
  }

  async #transcribe(): Promise<string | null> {
    return new Promise((resolve) => {
      const forceCpu = env.get('FORCE_CPU_DEVICE') ?? false
      const resolvedBackend = resolveFfmpegBackend()
      const device = forceCpu ? 'cpu' : (resolvedBackend.backend === 'nvidia' ? 'cuda' : 'cpu')
      logger.info(`[device]: ${device}`)

      // 👇 location of faster-whisper python isolation `pipx install faster-whisper`
      const command = env.get('PYTHON_FASTER_WHISPER')
      const whisperArgs = [
        './faster_whisper_cli.py',
        `"${this.source}"`,
        `"${this.item.destination}"`,
        'large-v3',
        device,
      ]

      const progress = new Progress('Transcribing')
      const stderrChunks: string[] = []
      const stdoutChunks: string[] = []

      progress.start()

      const whisperProcess = spawn(command, whisperArgs, {
        shell: true,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      })

      // capture stdout data in real-time
      whisperProcess.stdout.on('data', (data) => {
        const chunk = data.toString()
        stdoutChunks.push(chunk)
        logger.debug('[stdout] ' + chunk)
      })

      // capture stderr data in real-time
      whisperProcess.stderr.on('data', (data) => {
        const chunk = data.toString()
        stderrChunks.push(chunk)

        if (chunk.includes('%')) {
          const percent = Number(chunk.split('|').at(0)?.replace('%', '').trim())
          progress.update(percent)
        }
        logger.error('[whisper stderr] ' + chunk.trim())
      })

      // `spawn` emits a 'close' event when the process finishes
      whisperProcess.on('close', async (code) => {
        progress.update(100)

        if (code !== 0) {
          if (stderrChunks.length > 0) {
            const stderrTail = stderrChunks.join('').split('\n').slice(-20).join('\n').trim()
            if (stderrTail.length > 0) {
              logger.error('[error]: Whisper stderr tail:\n' + stderrTail)
            }
          }
          if (stdoutChunks.length > 0) {
            const stdoutTail = stdoutChunks.join('').split('\n').slice(-10).join('\n').trim()
            if (stdoutTail.length > 0) {
              logger.error('[error]: Whisper stdout tail:\n' + stdoutTail)
            }
          }
          logger.error(`[error]: Whisper process exited with code ${code}. Transcription failed.`)
          resolve(null)
          return
        }

        const srtFinal = await this.#transcribeCleanUp()

        progress.update(100)

        resolve(srtFinal)
      })

      // handle errors if the command itself cannot be executed
      whisperProcess.on('error', (err) => {
        logger.error(`[error]: Failed to start the whisper process. Error: ${err.message}`)
        resolve(null)
      })
    })
  }

  async #transcribeCleanUp(): Promise<string | null> {
    await this.#transcribeApplyReplacements('zh.srt')
    await this.#transcribeApplyReplacements(`zh.txt`)

    logger.info(`[completed]: post-processing and clean up`)

    return `${this.item.destination}/zh.srt`
  }

  async #transcribeApplyReplacements(filename: string) {
    try {
      let fileContent = await readFile(`${this.item.destination}/${filename}`, 'utf8')

      for (const [key, value] of replacements) {
        const regex = new RegExp(key, 'g')
        fileContent = fileContent.replace(regex, value)
      }

      await writeFile(`${this.item.destination}/${filename}`, fileContent, 'utf8')
    } catch (error) {
      logger.error(`[error]: Failed to apply replacements. Error: ${(error as Error).message}`)
    }
  }
}
