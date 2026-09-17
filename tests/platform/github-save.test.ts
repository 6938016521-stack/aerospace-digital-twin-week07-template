import { execFileSync, type ExecFileSyncOptions } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createGithubSaveMiddleware,
  createGithubSaveService,
  githubSavePlugin,
  runGit,
  type GitRunner,
} from '../../scripts/student/github-save'
import {
  createWeek07Draft,
  createWeek07EngineeringRecord,
  defaultBlankWeek07Artifact,
  exportWeek07Submission,
} from '../../src/student/lab'
import { renderWeek07Responses } from '../../src/student/responses'

const temporaryDirectories: string[] = []

function command(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'github-save-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function createRepository() {
  const base = temporaryDirectory()
  const remote = join(base, 'remote.git')
  const root = join(base, 'work')
  command(base, 'init', '--bare', remote)
  command(base, 'init', '--initial-branch=main', root)
  command(root, 'config', 'user.name', 'Student Test')
  command(root, 'config', 'user.email', 'student@example.test')
  mkdirSync(join(root, 'student'))
  writeFileSync(join(root, 'notes.txt'), 'original\n')
  command(root, 'add', 'notes.txt')
  command(root, 'commit', '-m', 'Initial')
  command(root, 'remote', 'add', 'origin', remote)
  command(root, 'push', '-u', 'origin', 'main')
  return { base, remote, root }
}

function githubRunner(options: { remote?: string, failPushes?: number } = {}): GitRunner {
  let remainingFailures = options.failPushes ?? 0
  return (args: readonly string[], commandOptions: ExecFileSyncOptions) => {
    const tail = args.slice(args.indexOf('remote'))
    if (tail.join(' ') === 'remote get-url origin' || tail.join(' ') === 'remote get-url --push origin') {
      return `${options.remote ?? 'https://github.com/student/week07-work.git'}\n`
    }
    if (args.includes('push') && remainingFailures > 0) {
      remainingFailures -= 1
      throw new Error('simulated authentication failure')
    }
    return runGit(args, commandOptions)
  }
}

function submission() {
  const modelText = JSON.stringify(defaultBlankWeek07Artifact)
  const record = createWeek07EngineeringRecord(
    'record-1',
    '1',
    { moduleId: 'controls', modelId: defaultBlankWeek07Artifact.id, version: defaultBlankWeek07Artifact.version },
    {},
    modelText,
  )
  return exportWeek07Submission(createWeek07Draft(record))
}

describe('student GitHub save service', () => {
  it('writes exact JSON and Markdown, commits first-save files only, and pushes to the current fork branch', async () => {
    const { remote, root } = createRepository()
    writeFileSync(join(root, 'notes.txt'), 'unrelated staged work\n')
    command(root, 'add', 'notes.txt')
    const value = submission()

    const result = await createGithubSaveService({ root, git: githubRunner() }).save(value)

    expect(result).toMatchObject({ ok: true, pushed: true, repositoryUrl: 'https://github.com/student/week07-work' })
    expect(readFileSync(join(root, 'student', 'submission.json'), 'utf8')).toBe(`${JSON.stringify(value, null, 2)}\n`)
    expect(readFileSync(join(root, 'student', 'responses.md'), 'utf8')).toBe(renderWeek07Responses(value))
    expect(command(root, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').split('\n').sort()).toEqual([
      'student/responses.md',
      'student/submission.json',
    ])
    expect(command(root, 'diff', '--cached', '--name-only')).toBe('notes.txt')
    expect(command(remote, 'show', 'main:student/submission.json')).toBe(JSON.stringify(value, null, 2))
  })

  it('returns the local commit after a failed push and retries that push without a duplicate commit', async () => {
    const { root } = createRepository()
    const service = createGithubSaveService({ root, git: githubRunner({ failPushes: 1 }) })

    const first = await service.save(submission())
    const countAfterFailure = command(root, 'rev-list', '--count', 'HEAD')
    const retry = await service.save(submission())

    expect(first).toMatchObject({ ok: false, pushed: false })
    expect(first.message).toContain('committed locally')
    expect(retry).toMatchObject({ ok: true, pushed: true, commitSha: first.commitSha })
    expect(command(root, 'rev-list', '--count', 'HEAD')).toBe(countAfterFailure)
  })

  it('refuses instructor repositories and accepts standard GitHub SSH origins', () => {
    const { root } = createRepository()
    const refused = createGithubSaveService({ root, git: githubRunner({ remote: 'git@github.com:vtaerodoctor-hokie/aerospace-digital-twin.git' }) }).status()
    const student = createGithubSaveService({ root, git: githubRunner({ remote: 'ssh://git@github.com/student/fork.git' }) }).status()

    expect(refused).toMatchObject({ available: false })
    expect(refused.reason).toContain('instructor source')
    expect(student).toMatchObject({ available: true, repositoryUrl: 'https://github.com/student/fork', branch: 'main' })
  })
})

async function serve(root: string, git: GitRunner, token = 'test-token') {
  const middleware = createGithubSaveMiddleware({ root, git, token })
  const server = createServer((request, response) => {
    void middleware(request, response, () => {
      response.statusCode = 404
      response.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}

describe('student GitHub save HTTP boundary', () => {
  it('requires a matching origin and random session token', async () => {
    const { root } = createRepository()
    const server = await serve(root, githubRunner())
    try {
      const external = await fetch(`${server.origin}/api/student/github/save`, {
        method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://attacker.example', 'x-student-save-token': 'test-token' }, body: '{}',
      })
      const missingToken = await fetch(`${server.origin}/api/student/github/save`, {
        method: 'POST', headers: { 'content-type': 'application/json', origin: server.origin }, body: '{}',
      })
      const status = await fetch(`${server.origin}/api/student/github/status`).then((response) => response.json()) as { token: string, available: boolean }
      expect(external.status).toBe(403)
      expect(missingToken.status).toBe(403)
      expect(status).toEqual(expect.objectContaining({ available: true, token: 'test-token' }))
    } finally {
      await server.close()
    }
  })

  it('accepts only this Codespace proxy rewrite of the local Vite origin', async () => {
    const { root } = createRepository()
    const server = await serve(root, githubRunner())
    const previousName = process.env.CODESPACE_NAME
    const previousDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    process.env.CODESPACE_NAME = 'musical-goldfish-qvpx45pp4rvjf9wx4'
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN = 'app.github.dev'
    const port = new URL(server.origin).port
    const expectedHost = `${process.env.CODESPACE_NAME}-${port}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    try {
      const accepted = await fetch(`${server.origin}/api/student/github/save`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: `http://localhost:${port}`,
          'x-forwarded-host': expectedHost,
          'x-forwarded-proto': 'https',
          'x-student-save-token': 'test-token',
        },
        body: '{}',
      })
      const wrongForwardedHost = await fetch(`${server.origin}/api/student/github/save`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: `http://localhost:${port}`,
          'x-forwarded-host': `attacker-${port}.app.github.dev`,
          'x-forwarded-proto': 'https',
          'x-student-save-token': 'test-token',
        },
        body: '{}',
      })
      const wrongLocalPort = await fetch(`${server.origin}/api/student/github/save`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: `http://127.0.0.1:${Number(port) + 1}`,
          'x-forwarded-host': expectedHost,
          'x-forwarded-proto': 'https',
          'x-student-save-token': 'test-token',
        },
        body: '{}',
      })
      expect(accepted.status).toBe(400)
      expect(wrongForwardedHost.status).toBe(403)
      expect(wrongLocalPort.status).toBe(403)
    } finally {
      if (previousName === undefined) delete process.env.CODESPACE_NAME
      else process.env.CODESPACE_NAME = previousName
      if (previousDomain === undefined) delete process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
      else process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN = previousDomain
      await server.close()
    }
  })

  it('rejects malformed and oversized bodies before writing student files', async () => {
    const { root } = createRepository()
    const server = await serve(root, githubRunner())
    const headers = { 'content-type': 'application/json', origin: server.origin, 'x-student-save-token': 'test-token' }
    try {
      const malformed = await fetch(`${server.origin}/api/student/github/save`, { method: 'POST', headers, body: '{broken' })
      const oversized = await fetch(`${server.origin}/api/student/github/save`, { method: 'POST', headers, body: JSON.stringify({ submission: { padding: 'x'.repeat(2_000_000) } }) })
      expect(malformed.status).toBe(400)
      expect(oversized.status).toBe(413)
      expect(command(root, 'status', '--porcelain', '--', 'student')).toBe('')
    } finally {
      await server.close()
    }
  })

  it('is registered only for the Vite development server', () => {
    expect(githubSavePlugin().apply).toBe('serve')
  })
})
