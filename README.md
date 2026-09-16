# Week 07 — Your individual engineering work

1. In Codespaces, run `npm run dev -- --host 0.0.0.0` and open forwarded port 5173.
2. Choose **Start Week07 lab**. Complete the five guided sections. Your browser draft is not a GitHub submission.
3. Export the implementation brief after recording physics, assumptions, equations and prediction. Ask your available AI tool to implement that brief as structured JSON only; do not authorize edits outside `student/`.
4. Import the returned JSON, run the model and verification, and inspect the aircraft. Record an independent hand check, claim, limitation and AI disclosure.
5. Export the submission and place the downloaded file at `student/submission.json` in this repository.
6. Run `npm run student:validate`. Failures identify missing evidence or model errors; do not erase failed attempts or call them verified.
7. Commit and push:

```sh
git add student/
git commit -m "Submit Week 07 controls model and engineering record"
git push
git rev-parse HEAD
```

Submit your repository URL and the full SHA printed by the final command through your instructor's usual submission channel. Give the instructor access if your repository is private. Do not paste that SHA back into the same commit. Review Actions after pushing.

All app, kernel, scene, validation, and workflow files are instructor supplied. Only `student/` is student owned. Export and commit incomplete work if necessary; its explicit status is evidence, not a passing result. Re-export after revisions; old verification does not verify a new model.

There is no separate oral defense. Your explanations belong in the submitted record. These illustrative calculations do not establish full aircraft controllability, trim, stability, or safety.
