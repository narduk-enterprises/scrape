import { execFileSync, ExecFileSyncOptions } from 'node:child_process'

export interface CommandOptions {
  cwd?: string
  encoding?: BufferEncoding
  stdio?: ExecFileSyncOptions['stdio']
  env?: NodeJS.ProcessEnv
}

export function runCommand(command: string, args: string[], options: CommandOptions = {}): string {
  const stdout = execFileSync(command, args, {
    encoding: options.encoding ?? 'utf-8',
    stdio: options.stdio ?? ['pipe', 'pipe', 'pipe'],
    cwd: options.cwd,
    env: options.env,
  })

  if (stdout === null) return ''
  return typeof stdout === 'string' ? stdout : stdout.toString(options.encoding ?? 'utf-8')
}

export function tryRunCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): string | null {
  try {
    return runCommand(command, args, options)
  } catch {
    return null
  }
}
