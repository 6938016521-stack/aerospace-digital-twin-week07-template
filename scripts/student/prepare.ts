import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { renderWeek07Responses } from '../../src/student/responses'

const usage = 'Usage: npm run student:prepare -- [submission.json] [--check]'
const args = process.argv.slice(2)
const check = args.includes('--check')
const paths = args.filter(arg => arg !== '--check')

try {
  if (paths.length > 1) throw new Error(usage)
  const source = resolve(paths[0] ?? 'student/submission.json')
  const destination = resolve('student/submission.json')
  const responses = resolve('student/responses.md')
  if (!existsSync(source)) throw new Error(`Submission JSON was not found at ${source}. Export submission.json from the lab or provide its downloaded path.`)
  const raw = readFileSync(source, 'utf8')
  let submission: unknown
  try { submission = JSON.parse(raw) } catch (error) { throw new Error(`Submission JSON is malformed at ${source}: ${error instanceof Error ? error.message : String(error)}`, { cause: error }) }
  const markdown = renderWeek07Responses(submission)
  if (check) {
    if (!existsSync(responses)) throw new Error(`responses.md is missing at ${responses}. Run npm run student:prepare first.`)
    if (readFileSync(responses, 'utf8') !== markdown) throw new Error(`responses.md is stale at ${responses}. Run npm run student:prepare to regenerate it from ${source}.`)
    console.log(`responses.md matches ${source}.`)
  } else {
    mkdirSync(dirname(destination), { recursive: true })
    if (source !== destination) copyFileSync(source, destination)
    writeFileSync(responses, markdown)
    console.log(`Prepared ${destination} and ${responses} from ${source}.`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
