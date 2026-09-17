# Week 07 — Controls lab

Build two calculations in the aircraft app, explain your reasoning, and submit your work in your own fork.

## 1. Fork and open the app

1. Open [the student starter](https://github.com/vtaerodoctor-hokie/aerospace-digital-twin-week07-template/fork) and choose **Create fork** under your own GitHub account.
2. In **your fork**, choose **Code → Codespaces → Create codespace on main**. Wait for dependency installation to finish.
3. In its terminal, run:

```sh
npm run dev -- --host 0.0.0.0
```

4. Open forwarded port **5173**, then select **Start Week07 lab**.

Local alternative: clone your fork, install Node 22.12 or later, run `npm ci`, then `npm run dev`.

Before your first save, open **Actions** in your fork and click **I understand my workflows, go ahead and enable them** if GitHub shows that prompt. This enables the supplied submission checks; the app also runs model checks during the lab.

## 2. Complete the lab

Follow **Understand → Model → Predict → Implement and check → Conclude**.

- Explain the signs, assumptions and equations; record your prediction before running your implementation.
- Export the implementation brief. Use AI or the expression editor to implement `controls.demand` and `controls.effectiveness` as structured arithmetic JSON.
- Import your model JSON, run the baseline and changed conditions, and run verification checks.
- Write an independent hand check, your conclusion, a limitation, next evidence and AI disclosure.

**Run my model** calculates your results and starts a two-second pitch response from rest. Watch the aircraft rotate about its CG and compare the pitch angle and pitch rate for each investigation. Use **Pause pitch**, **Resume pitch**, or **Replay from rest** to inspect the response. Select the side camera for the clearest view. Each new run restores the starting condition; changing the investigation selection takes effect when you run again. A model that cannot execute displays an error instead of a reference response.

Your expressions supply the app's required-moment and elevator-moment calculations. Aircraft geometry, integration and the user interface are provided. Edit only files under `student/`. Browser saves are drafts; they are not commits.

## 3. Save to GitHub

Click **Save to GitHub** in the app whenever you want to save a response. The app:

1. Writes your current answers, model and evidence to `student/submission.json`.
2. Generates `student/responses.md` with each question and your answer.
3. Creates a commit and pushes it to your fork using your Codespace's GitHub authentication.

Wait for **Saved on GitHub** and the commit link. Changes you make afterward need another save. Incomplete work can be saved; saving is separate from passing verification. Repeated saves without changes do not create empty commits.

If pushing fails, the app tells you and retains the local commit. Fix the reported connection/authentication issue and click the button again. It never force-pushes. If the app says you opened the starter or instructor repository, launch the app from **your own fork** instead.

## 4. Submit

Open the saved commit link and confirm that `student/responses.md` contains your answers. Submit your **fork URL and full saved commit SHA** through the instructor's submission channel. No pull request or merge into the instructor repository is needed.

The starter and its forks are public, so use your GitHub username for identification and keep personal information out of answers. Your instructor fetches your submitted commit and reads the Markdown file directly.

## Recovery: manual export and commit

If Save to GitHub is unavailable, click **Export submission**, move the downloaded JSON into `student/submission.json` in Codespaces, then run:

```sh
npm run student:prepare
npm run student:validate
git add student/
git commit -m "Submit Week 07 controls work"
git push
git rev-parse HEAD
```

`student:prepare` generates the same `responses.md` file. Re-export and regenerate after revisions; do not edit generated Markdown separately. Validation failures identify incomplete reasoning or model errors; you can still commit incomplete work honestly. On your own computer, `npm run student:prepare -- /path/to/downloaded/submission.json` also copies the JSON into place.

Save to GitHub requires the development server (`npm run dev`) inside your fork with Git authentication and author identity configured. A static/preview build has no Git save service; export remains available there.
