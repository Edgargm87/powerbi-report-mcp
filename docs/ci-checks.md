<!-- doc-version: 1.0 | Last updated: 2026-04-15 -->
# How CI Checks Work

A walkthrough of what that little green ✓ (or red ✗) next to a commit actually means, what triggers it, and how to read it when it's red. Aimed at first-time contributors who've never set up a GitHub Actions workflow before.

If you just want to know how to pass the checks, jump to [Section 7 — Practical daily workflow](#7-practical-daily-workflow). If you're debugging a red X, jump to [Section 8 — When a check fails](#8-when-a-check-fails).

---

## 1. The trigger chain

When you run `git push origin master`, here's what happens behind the scenes:

```
git push                           (you)
  → GitHub receives new commit <sha>
  → GitHub looks at .github/workflows/*.yml in that commit
  → Finds ci.yml with `on: push: branches: [master]`
  → Matches → queues a workflow run
  → Spins up a fresh ubuntu-24.04 VM
  → Runs the steps in your job
  → Reports each step's pass/fail back to GitHub
  → GitHub aggregates into a single "check status" on the commit
```

The `on:` block in `.github/workflows/ci.yml` is the subscription. It tells GitHub "wake me up when these events happen":

```yaml
on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]
```

Two events trigger CI in this repo:

- a **push** to `master` or `main`
- a **pull request** targeting `master` or `main`

A push to a feature branch does not trigger CI. A PR from a feature branch into `master` does. This keeps runner minutes low while still gating everything that actually lands on `master`.

---

## 2. A "check" is a message, not a program

GitHub has a thing called the **Checks API**. Any external system (GitHub Actions, CircleCI, a custom bot) can post a "check" against a commit SHA with:

- a **name** (e.g., `build + audit + validator`)
- a **status** (`queued` / `in_progress` / `completed`)
- a **conclusion** (`success` / `failure` / `cancelled` / `skipped` / `neutral` / `timed_out` / `action_required`)
- optional logs, annotations, and a URL to a details page

GitHub Actions is just one producer of these check messages. When a workflow finishes, it calls the Checks API to post one check **per job** in the workflow. For `ci.yml` there's one job, so one check gets posted. The ✓ or ✗ you see next to the commit is GitHub rendering that one check.

---

## 3. The hierarchy: workflow → job → step

`ci.yml` defines:

```
workflow: "CI"
  job: "build + audit + validator"     ← one check posted for this job
    step 1: Checkout
    step 2: Setup Node.js
    step 3: Install dependencies       (npm ci)
    step 4: Build TypeScript           (npm run build)
    step 5: Audit skill coverage       (npm run audit:strict)
    step 6: Run wireframe-validator    (npm run test:wireframe)
```

Rules:

- If **any** step fails, the job fails, and the check is marked `failure`.
- Subsequent steps are **skipped** by default after a failure. (This is why the first v0.5.9 CI run showed `Build TypeScript` = failure and steps 5–6 = skipped — the build never produced `dist/`, so there was nothing to audit.)
- If you had multiple jobs (say `build`, `audit`, `validate` as three separate jobs), GitHub would post **one check per job** and the commit page would show three separate lines. Splitting jobs lets them run in parallel and fail independently, but costs more runner minutes. One-job-three-steps is fine for a 17-second workflow.

---

## 4. The aggregation: why you see a single ✓

On any commit page, PR page, or the branch list, GitHub shows an aggregate rollup of all checks for that commit:

| Icon | Aggregate state | What it means |
|---|---|---|
| ○ (empty circle) | No checks reported yet | Just pushed, runner hasn't started |
| 🟡 (yellow dot) | `in_progress` or `queued` | Runner is working, wait ~15–90s |
| ✓ (green check) | All checks succeeded | Merge-ready |
| ✗ (red X) | At least one failure | Click → Details → read logs |
| ⊘ (gray circle with line) | `cancelled` | You (or concurrency rule) cancelled |
| ⚠ (orange !) | `action_required` | Manual approval needed (e.g. PR from a fork) |

Clicking the icon opens a popup listing every check individually. Clicking "Details" on any line opens the full job view — that's where the step-by-step logs live. For this repo, with one job posting one check, the popup will just show the single `build + audit + validator` entry.

---

## 5. The concurrency rule

`ci.yml` includes:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

This means: if you push commit A and then push commit B before A's CI run finishes, GitHub **cancels** the in-progress run for A and starts a new one for B. You don't pay for CI cycles on code nobody's going to look at. If you see a gray circle on an older commit, this is usually why.

---

## 6. Branch protection (the gate vs the smoke alarm)

Here's a subtlety worth knowing: **by default, CI is informational, not enforcing.**

Without any extra configuration:

- A red X on `master` is cosmetic. The push already happened. Nothing rolls back.
- A PR with a red X can still be merged if somebody clicks the merge button.
- Somebody can `git push --no-verify` and skip the pre-commit hook, then push broken code to `master`, and the red X appears **after** the damage.

For the gate to actually enforce anything, you need **branch protection rules**, configured in:

**GitHub repo → Settings → Branches → Branch protection rules → Add rule**

For a branch name pattern of `master` (or `main`), the knobs that matter:

- ☑ **Require a pull request before merging** — stops direct-to-master pushes entirely. Everything must go through a PR.
- ☑ **Require status checks to pass before merging** — pick `build + audit + validator` from the dropdown. A PR with a red X cannot merge.
  - ☑ **Require branches to be up to date before merging** — forces rebase before merge, so the check ran against the exact code that will land on `master`.
- ☑ **Do not allow bypassing the above settings** — even admins can't merge red PRs.

Without these, the CI workflow is a smoke alarm with nobody wired to listen. With them, the red X actually blocks bad code from landing. If you're serious about the gate, turn protection on — it's free and takes 90 seconds to configure.

---

## 7. Practical daily workflow

Assuming branch protection is on:

```
1. Work on a feature branch
      git checkout -b feature/my-thing
      # edit files
      git add -A && git commit -m "feat: my thing"
      # pre-commit hook runs audit + validator locally (fast path)

2. Push the branch
      git push -u origin feature/my-thing

3. Open a PR into master on github.com
      → GitHub triggers ci.yml (on: pull_request)
      → Yellow dot appears on the PR within a few seconds
      → 15–90s later: green ✓ or red X

4. If green
      → "Merge" button is enabled
      → Merge the PR
      → GitHub triggers ci.yml again (on: push to master)
      → Green ✓ on the merge commit

5. If red
      → Click "Details" on the failing check
      → Read the step log
      → Fix, commit, push to the same branch
      → CI re-runs automatically
      → Loop until green
```

The pre-commit hook is your **local fast path**: the same audit + validator checks, running on your machine before the commit is even made, so you usually never see the red X at all. CI is the safety net for when somebody skips hooks (`--no-verify`) or forgot to install them (`npm run hooks:install`).

---

## 8. When a check fails

### Step 1: find which step failed

- Click the red ✗ on the commit row (or the "Checks" tab on a PR).
- In the popup, click **Details** on the failing check.
- You'll land on the job page with a collapsible list of steps. The failing step is expanded by default and marked with a red ✗.

### Step 2: read the log

Each step is a shell session on the runner. The log shows everything stdout and stderr. For this repo:

- **Build TypeScript fails** → look for lines starting with `error TS` (TypeScript compile errors) or `##[error]`. Usually a type mismatch in `src/`.
- **Audit skill coverage fails** → look for `MISSING (no backtick mention...)`. Every registered tool must have a backtick mention in at least one `skills/*.md` file. Add the mention, commit, push.
- **Wireframe validator fails** → look for `Suite result: X/12` where X < 12. The failing cases are named (e.g., `Layout A — 5 KPI cards`). Check whether you touched `src/wireframe-validator.ts` or `scripts/test-wireframe-validator.js`.
- **Install dependencies fails** → usually a `package-lock.json` out of sync with `package.json`. Run `npm install --package-lock-only` locally, commit the lock, push.

### Step 3: reproduce locally

The CI job does exactly three things after install:

```
npm run build
npm run audit:strict
npm run test:wireframe
```

Run all three with the convenience script:

```
npm run test:all
```

If all three pass locally but CI is still red, the usual suspects are:

1. **Stale `dist/`** committed to the repo but drifted from `src/`. Delete `dist/`, run `npm run build`, `git add dist/`, commit.
2. **Case-sensitive import paths** — Linux (CI) cares, Windows/Mac don't. `import { Foo } from "./foo.js"` vs `"./Foo.js"` compiles locally but fails on Linux.
3. **`package-lock.json` out of sync** — run `npm install --package-lock-only`, commit the lock.
4. **Node version mismatch** — CI uses Node 20. If you're on 18 or 22 locally, subtle TS diagnostics may differ. Match with `nvm use 20` or similar.

### Step 4: advanced — fetch logs via the API

If you're working in a terminal and don't want to click through the GitHub UI, and you have the `gh` CLI installed:

```
gh run list --limit 5
gh run view <run-id> --log-failed
```

That dumps only the failing step's log straight to your terminal. Very fast for tight iteration loops.

Without `gh` installed, you can hit the REST API directly:

```
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/OWNER/REPO/actions/runs?per_page=5
```

Every run has an `id` and a `conclusion`. Fetch `/actions/runs/<id>/jobs` for step-level status, and `/actions/jobs/<job-id>/logs` for the raw log (returns a redirect to a zip download). The `$GITHUB_TOKEN` can be a personal access token with `repo` scope for private repos, or omitted entirely for public repos.

---

## 9. Further reading

- [GitHub Actions docs — Workflow syntax](https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions)
- [GitHub Checks API reference](https://docs.github.com/rest/checks)
- [Branch protection rules](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches)
- This repo's workflow file: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- This repo's pre-commit hook: [`.githooks/pre-commit`](../.githooks/pre-commit)
- `CONTRIBUTING.md` [Section 6 — QA Expectations](../CONTRIBUTING.md#6-qa-expectations) — the gate table this doc expands on
