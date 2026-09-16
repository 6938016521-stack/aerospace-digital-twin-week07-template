import { readFileSync } from 'node:fs'
import { reviewSubmission } from './review'
try {
  const text=readFileSync(process.argv[2] ?? 'student/submission.json','utf8')
  if(text.length>2_000_000) throw new Error('Submission exceeds 2 MB limit.')
  const review=reviewSubmission(JSON.parse(text));console.log(JSON.stringify(review,null,2))
  if(review.status!=='checks-passed') process.exitCode=1
} catch(error) { console.error(error instanceof Error?error.message:String(error));process.exitCode=1 }
