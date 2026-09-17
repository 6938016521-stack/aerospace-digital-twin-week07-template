import { execFileSync, type ExecFileSyncOptions } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { Plugin } from 'vite'
import { loadWeek07Draft } from '../../src/student/lab'
import { renderWeek07Responses } from '../../src/student/responses'

const STATUS_PATH = '/api/student/github/status'
const SAVE_PATH = '/api/student/github/save'
const MAX_BODY_BYTES = 2_000_000
const SAVED_PATHS = ['student/submission.json', 'student/responses.md'] as const
const REFUSED_REPOSITORIES = new Set([
  'vtaerodoctor-hokie/aerospace-digital-twin',
  'vtaerodoctor-hokie/aerospace-digital-twin-week07-template',
])

export type GitRunner = (args: readonly string[], options: ExecFileSyncOptions) => string

export interface GithubSaveStatus {
  available: boolean
  repositoryUrl?: string
  branch?: string
  token: string
  reason?: string
}

export interface GithubSaveResult {
  ok: boolean
  commitSha?: string
  repositoryUrl?: string
  commitUrl?: string
  pushed: boolean
  message: string
}

interface RepositoryContext {
  root: string
  repository: string
  repositoryUrl: string
  branch: string
}

export interface GithubSaveServiceOptions {
  root: string
  token?: string
  git?: GitRunner
}

class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function gitEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  // Do not allow the dev-server process environment to redirect commands away
  // from the repository and index that were explicitly selected below.
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete environment[key]
  environment.GIT_TERMINAL_PROMPT = '0'
  return environment
}

export const runGit: GitRunner = (args, options) => execFileSync('git', args, {
  encoding: 'utf8',
  timeout: 60_000,
  ...options,
  env: gitEnvironment(),
}).toString()

function git(runner: GitRunner, root: string, args: readonly string[]): string {
  return runner(['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', '-C', root, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: gitEnvironment(),
    timeout: 60_000,
  }).trim()
}

function parseGithubRemote(value: string): { repository: string, repositoryUrl: string } {
  const remote = value.trim()
  const scp = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote)
  let parts: [string, string]
  if (scp) parts = [scp[1]!, scp[2]!]
  else {
    let url: URL
    try { url = new URL(remote) } catch { throw new Error('Origin must be a GitHub HTTPS or SSH repository URL.') }
    if (url.hostname.toLowerCase() !== 'github.com' || url.search || url.hash) throw new Error('Origin must be a GitHub HTTPS or SSH repository URL.')
    if (url.protocol === 'https:') {
      if (url.username || url.password || url.port) throw new Error('Origin URL must not contain embedded credentials or a custom port.')
    } else if (url.protocol === 'ssh:') {
      if ((url.username && url.username !== 'git') || url.password || url.port) throw new Error('Origin must use the standard GitHub SSH URL.')
    } else {
      throw new Error('Origin must be a GitHub HTTPS or SSH repository URL.')
    }
    const pathParts = url.pathname.replace(/^\/+|\/+$/g, '').split('/')
    if (pathParts.length !== 2) throw new Error('Origin must identify one GitHub owner and repository.')
    parts = [pathParts[0]!, pathParts[1]!.replace(/\.git$/, '')]
  }
  const [owner, repository] = parts
  const safePart = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/
  if (!safePart.test(owner) || !safePart.test(repository) || owner.includes('..') || repository.includes('..')) {
    throw new Error('Origin contains an invalid GitHub owner or repository name.')
  }
  const name = `${owner}/${repository}`
  return { repository: name, repositoryUrl: `https://github.com/${name}` }
}

function repositoryContext(root: string, runner: GitRunner): RepositoryContext {
  let repositoryRoot: string
  try { repositoryRoot = realpathSync(git(runner, root, ['rev-parse', '--show-toplevel'])) } catch { throw new Error('This development server is not running in a Git repository.') }
  const configuredRoot = realpathSync(root)
  if (repositoryRoot !== configuredRoot) throw new Error('The development server must run at the root of the student Git repository.')

  let parsed: ReturnType<typeof parseGithubRemote>
  try { parsed = parseGithubRemote(git(runner, root, ['remote', 'get-url', 'origin'])) } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'A valid GitHub origin is required.', { cause: error })
  }
  let pushRepository: ReturnType<typeof parseGithubRemote>
  try { pushRepository = parseGithubRemote(git(runner, root, ['remote', 'get-url', '--push', 'origin'])) } catch (error) {
    throw new Error('Origin must have a valid GitHub push URL.', { cause: error })
  }
  if (pushRepository.repository.toLowerCase() !== parsed.repository.toLowerCase()) {
    throw new Error('Origin fetch and push URLs must identify the same GitHub repository.')
  }
  if (REFUSED_REPOSITORIES.has(parsed.repository.toLowerCase())) {
    throw new Error('Saving is disabled for the instructor source and classroom starter repositories. Open your own GitHub fork and try again.')
  }

  let branch: string
  try { branch = git(runner, root, ['symbolic-ref', '--quiet', '--short', 'HEAD']) } catch { throw new Error('Git is in detached HEAD state. Check out your student branch before saving.') }
  if (!branch || branch === 'HEAD' || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) || branch.includes('..') || branch.includes('@{') || branch.endsWith('/') || branch.includes('//')) {
    throw new Error('The current Git branch name is not safe to push.')
  }

  const conflictPaths = git(runner, root, ['diff', '--name-only', '--diff-filter=U'])
  const gitDir = resolve(root, git(runner, root, ['rev-parse', '--git-dir']))
  const inProgress = conflictPaths || existsSync(join(gitDir, 'MERGE_HEAD')) || existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'))
  if (inProgress) throw new Error('Finish or abort the current merge/rebase and resolve all conflicts before saving.')

  let name = ''
  let email = ''
  try { name = git(runner, root, ['config', '--get', 'user.name']) } catch { /* Report one actionable identity error below. */ }
  try { email = git(runner, root, ['config', '--get', 'user.email']) } catch { /* Report one actionable identity error below. */ }
  if (!name || !email) throw new Error('Git author identity is missing. Set git config user.name and user.email, then try again.')
  return { root, ...parsed, branch }
}

function validateSubmission(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(400, 'submission must be a JSON object.')
  const submission = value as Record<string, unknown>
  if (submission.schemaVersion !== 'week07.submission/v1') throw new RequestError(400, 'submission has an unsupported or missing schemaVersion.')
  const record = submission.record as { revision?: unknown } | null
  if (!record || typeof record !== 'object' || typeof record.revision !== 'string') throw new RequestError(400, 'submission.record is missing or malformed.')
  if (!submission.model || typeof submission.model !== 'object' || Array.isArray(submission.model)) throw new RequestError(400, 'submission.model is missing or malformed.')
  if (!Array.isArray(submission.runs)) throw new RequestError(400, 'submission.runs must be an array.')
  if (!submission.readiness || typeof submission.readiness !== 'object' || Array.isArray(submission.readiness)) throw new RequestError(400, 'submission.readiness is missing or malformed.')
  if (submission.verification !== null && submission.verification !== undefined && (typeof submission.verification !== 'object' || Array.isArray(submission.verification))) {
    throw new RequestError(400, 'submission.verification must be an object or null.')
  }
  const draft = {
    revision: record.revision,
    record: submission.record,
    artifact: submission.model,
    runs: submission.runs,
    verification: submission.verification ?? undefined,
  }
  const checked = loadWeek07Draft({ getItem: () => JSON.stringify(draft), setItem: () => undefined }, 'request')
  if (!checked.draft) throw new RequestError(400, checked.error ?? 'submission has an invalid Week 07 shape.')
  return submission
}

function safeTarget(root: string, relativePath: typeof SAVED_PATHS[number]): string {
  const target = resolve(root, relativePath)
  if (relative(root, target).startsWith(`..${sep}`) || target === root) throw new Error('Resolved student file escaped the repository.')
  const parent = dirname(target)
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true })
  if (!lstatSync(parent).isDirectory() || realpathSync(parent) !== join(realpathSync(root), 'student')) throw new Error('student must be a real directory inside the repository.')
  if (existsSync(target) && (!lstatSync(target).isFile() || lstatSync(target).isSymbolicLink())) throw new Error(`${relativePath} must be a regular file.`)
  return target
}

function writeAtomically(target: string, contents: string): void {
  const mode = existsSync(target) ? lstatSync(target).mode & 0o777 : 0o644
  const temporary = join(dirname(target), `.${randomBytes(12).toString('hex')}.tmp`)
  try {
    writeFileSync(temporary, contents, { encoding: 'utf8', flag: 'wx', mode })
    chmodSync(temporary, mode)
    renameSync(temporary, target)
  } finally {
    if (existsSync(temporary)) rmSync(temporary)
  }
}

function commitUrl(context: RepositoryContext, sha: string): string {
  return `${context.repositoryUrl}/commit/${sha}`
}

export function createGithubSaveService(options: GithubSaveServiceOptions) {
  const root = resolve(options.root)
  const runner = options.git ?? runGit
  const token = options.token ?? randomBytes(32).toString('base64url')
  let saveQueue: Promise<unknown> = Promise.resolve()

  function status(): GithubSaveStatus {
    try {
      const context = repositoryContext(root, runner)
      return { available: true, repositoryUrl: context.repositoryUrl, branch: context.branch, token }
    } catch (error) {
      return { available: false, token, reason: error instanceof Error ? error.message : String(error) }
    }
  }

  async function saveNow(input: unknown): Promise<GithubSaveResult> {
    const submission = validateSubmission(input)
    const context = repositoryContext(root, runner)
    const json = `${JSON.stringify(submission, null, 2)}\n`
    const markdown = renderWeek07Responses(submission)
    const submissionPath = safeTarget(root, SAVED_PATHS[0])
    const responsePath = safeTarget(root, SAVED_PATHS[1])
    writeAtomically(submissionPath, json)
    writeAtomically(responsePath, markdown)

    const changed = git(runner, root, ['status', '--porcelain', '--untracked-files=all', '--', ...SAVED_PATHS]) !== ''
    if (changed) {
      try {
        git(runner, root, ['add', '--', ...SAVED_PATHS])
        git(runner, root, ['commit', '--only', '--no-gpg-sign', '-m', 'Save Week 07 submission', '--', ...SAVED_PATHS])
      } catch {
        throw new RequestError(409, 'The student files were written, but Git could not commit them. Resolve the reported Git state locally, then try Save to GitHub again.')
      }
    }
    const sha = git(runner, root, ['rev-parse', 'HEAD'])
    const base = { commitSha: sha, repositoryUrl: context.repositoryUrl, commitUrl: commitUrl(context, sha) }
    try {
      git(runner, root, ['push', 'origin', `HEAD:refs/heads/${context.branch}`])
      return {
        ok: true,
        ...base,
        pushed: true,
        message: changed ? 'Saved, committed, and pushed the Week 07 submission.' : 'The saved files were unchanged; the existing commit was pushed successfully.',
      }
    } catch {
      return {
        ok: false,
        ...base,
        pushed: false,
        message: `The submission is committed locally at ${sha}, but the push failed. Sign in to GitHub and confirm write access, then select Save to GitHub again; unchanged files will reuse this commit.`,
      }
    }
  }

  function save(input: unknown): Promise<GithubSaveResult> {
    const operation = saveQueue.then(() => saveNow(input))
    saveQueue = operation.catch(() => undefined)
    return operation
  }

  return { token, status, save }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(body)
}

function requestOrigin(request: IncomingMessage): string | null {
  const value = request.headers.origin
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function isSameOrigin(request: IncomingMessage): boolean {
  const rawOrigin = requestOrigin(request)
  const forwardedHost = request.headers['x-forwarded-host']
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)?.split(',')[0]?.trim() || request.headers.host
  if (!rawOrigin || !host) return false
  try {
    const origin = new URL(rawOrigin)
    const forwarded = request.headers['x-forwarded-proto']
    const forwardedProtocol = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
    const encrypted = 'encrypted' in request.socket && request.socket.encrypted === true
    const protocol = forwardedProtocol === 'https' || forwardedProtocol === 'http'
      ? `${forwardedProtocol}:`
      : encrypted ? 'https:' : 'http:'
    return origin.origin === `${protocol}//${host}`
  } catch {
    return false
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers['content-type'] ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) throw new RequestError(415, 'Content-Type must be application/json.')
  const declaredLength = Number(request.headers['content-length'])
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new RequestError(413, 'Request body exceeds the 2 MB limit.')
  const chunks: Buffer[] = []
  let length = 0
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
    length += chunk.length
    if (length > MAX_BODY_BYTES) throw new RequestError(413, 'Request body exceeds the 2 MB limit.')
    chunks.push(chunk)
  }
  let parsed: unknown
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new RequestError(400, 'Request body is not valid JSON.') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Object.hasOwn(parsed, 'submission')) throw new RequestError(400, 'Request body must contain submission.')
  return (parsed as { submission: unknown }).submission
}

export function createGithubSaveMiddleware(options: GithubSaveServiceOptions) {
  const service = createGithubSaveService(options)
  return async (request: IncomingMessage, response: ServerResponse, next: () => void = () => undefined) => {
    const path = request.url?.split('?', 1)[0]
    if (path !== STATUS_PATH && path !== SAVE_PATH) return next()
    if (path === STATUS_PATH) {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed.' })
      return sendJson(response, 200, service.status())
    }
    if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' })
    if (!isSameOrigin(request)) return sendJson(response, 403, { error: 'Save request must come from this development server.' })
    if (request.headers['x-student-save-token'] !== service.token) return sendJson(response, 403, { error: 'Save session token is missing or invalid. Refresh the page and try again.' })
    try {
      const result = await service.save(await readJsonBody(request))
      return sendJson(response, result.ok ? 200 : 502, result)
    } catch (error) {
      const status = error instanceof RequestError ? error.status : 409
      return sendJson(response, status, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

export function githubSavePlugin(options: { root?: string, token?: string, git?: GitRunner } = {}): Plugin {
  return {
    name: 'student-github-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createGithubSaveMiddleware({
        root: options.root ?? server.config.root,
        ...(options.token === undefined ? {} : { token: options.token }),
        ...(options.git === undefined ? {} : { git: options.git }),
      }))
    },
  }
}
