import { spawn } from 'node:child_process'
import { accessSync, chmodSync, constants, mkdirSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { CopilotProcess } from './copilotService'

/** npm package that carries the language server executable for a platform, or null if unsupported. */
export function copilotPackageFor(
  platform: string,
  arch: string
): { pkg: string; exe: string } | null {
  const os =
    platform === 'win32'
      ? 'win32'
      : platform === 'darwin'
        ? 'darwin'
        : platform === 'linux'
          ? 'linux'
          : null
  const cpu = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : null
  if (!os || !cpu) return null
  return {
    pkg: `copilot-language-server-${os}-${cpu}`,
    exe: platform === 'win32' ? 'copilot-language-server.exe' : 'copilot-language-server'
  }
}

export interface LaunchPlan {
  command: string
  args: string[]
  /** Extra environment for a script run through Electron's embedded Node (tests only). */
  runAsNode: boolean
}

export interface LocateInput {
  packaged: boolean
  resourcesPath: string
  appPath: string
  platform: string
  arch: string
  env: NodeJS.ProcessEnv
  execPath: string
  exists(file: string): boolean
}

/**
 * Where the language server lives. Installed builds carry it in `resources/copilot/`; a development
 * checkout uses the platform package from `node_modules`. Nothing is downloaded at run time.
 * Only an unpackaged build honours `MARKDOWN_STUDIO_COPILOT_SERVER_SCRIPT`, which the automated
 * tests use to substitute a deterministic mock; an installed application ignores it.
 */
export function locateCopilotServer(input: LocateInput): LaunchPlan | null {
  const script = input.env.MARKDOWN_STUDIO_COPILOT_SERVER_SCRIPT
  if (!input.packaged && script && path.isAbsolute(script) && input.exists(script)) {
    return { command: input.execPath, args: [script, '--stdio'], runAsNode: true }
  }
  const target = copilotPackageFor(input.platform, input.arch)
  if (!target) return null
  const candidates = input.packaged
    ? [path.join(input.resourcesPath, 'copilot', target.exe)]
    : [path.join(input.appPath, 'node_modules', '@github', target.pkg, target.exe)]
  const found = candidates.find((file) => input.exists(file))
  return found ? { command: found, args: ['--stdio'], runAsNode: false } : null
}

export function fileExists(file: string): boolean {
  try {
    accessSync(file, constants.R_OK)
    return true
  } catch {
    return false
  }
}

/** Environment variables the language server may see. Nothing else is inherited. */
const INHERITED = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'SYSTEMROOT',
  'SystemDrive',
  'COMSPEC',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'SSL_CERT_FILE',
  'NODE_EXTRA_CA_CERTS',
  'APPDATA',
  'LOCALAPPDATA',
  'ProgramData',
  'XDG_RUNTIME_DIR'
]

/**
 * The child's environment. The account session is stored in `stateDir` (a private folder of this
 * application), so the server neither reads nor changes the sign-in of other GitHub Copilot
 * editors on the computer, and tokens passed through environment variables (GITHUB_COPILOT_TOKEN,
 * GH_COPILOT_TOKEN and similar) can never reach it.
 */
export function copilotEnvironment(
  source: NodeJS.ProcessEnv,
  stateDir: string,
  runAsNode: boolean
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const name of INHERITED) if (source[name] !== undefined) env[name] = source[name]
  env.XDG_CONFIG_HOME = path.join(stateDir, 'config')
  env.XDG_CACHE_HOME = path.join(stateDir, 'cache')
  env.XDG_DATA_HOME = path.join(stateDir, 'data')
  env.XDG_STATE_HOME = path.join(stateDir, 'state')
  if (runAsNode) env.ELECTRON_RUN_AS_NODE = '1'
  return env
}

/** Starts the language server with stdio pipes and the restricted environment. */
export function spawnCopilot(
  plan: LaunchPlan,
  stateDir: string,
  source: NodeJS.ProcessEnv
): CopilotProcess {
  ensurePrivateDirectories(stateDir)
  const child = spawn(plan.command, plan.args, {
    env: copilotEnvironment(source, stateDir, plan.runAsNode),
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
    shell: false
  })
  child.stdin.on('error', () => undefined)
  return {
    stdout: child.stdout,
    stdin: child.stdin,
    kill: () => void child.kill(),
    onExit: (listener) => {
      child.once('exit', (code) => listener(code))
      child.once('error', () => listener(null))
    }
  }
}

const SUBDIRECTORIES = ['config', 'cache', 'data', 'state']

/**
 * Creates the language server's folders readable by this user only (mode 0700, also corrected
 * if they already exist). Windows ignores POSIX modes; there the folder inherits the ACL of the
 * user's own application-data directory.
 */
export function ensurePrivateDirectories(stateDir: string): void {
  for (const dir of [stateDir, ...SUBDIRECTORIES.map((sub) => path.join(stateDir, sub))]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    if (process.platform !== 'win32') chmodSync(dir, 0o700)
  }
}

/** Deletes everything the language server stored about the signed-in account. */
export async function clearCopilotSession(stateDir: string): Promise<void> {
  await fs.rm(path.join(stateDir, 'config', 'github-copilot'), { recursive: true, force: true })
}
