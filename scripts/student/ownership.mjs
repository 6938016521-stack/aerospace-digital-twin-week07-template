import { execFileSync } from 'node:child_process'
const base = process.argv[2]
if (!base || !/^[0-9a-f]{40}$/.test(base)) throw new Error('Provide the pinned 40-character platform base SHA.')
const changed = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const forbidden = changed.filter(path => !path.startsWith('student/'))
if (forbidden.length) { console.error('Changes outside student ownership:\n' + forbidden.join('\n')); process.exitCode = 1 }
else console.log('Student-owned path check passed.')
