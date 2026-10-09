# Contributing to dsh-work-game

Thanks for your interest in contributing! This document explains the workflow, conventions, and
quality bar for every change to `frederico-kluser/dsh-work-game`.

Please note that this project is released with a [Code of Conduct](CODE_OF_CONDUCT.md). By
participating, you are expected to uphold it.

## Getting started

1. **Fork** the repository on GitHub and clone your fork:

   ```bash
   git clone https://github.com/<your-user>/dsh-work-game.git
   cd dsh-work-game
   git remote add upstream https://github.com/frederico-kluser/dsh-work-game.git
   ```

2. **Toolchain** — the demo is pure HTML/CSS/JS/SVG with **zero dependencies and no build step**.
   You only need:

   - **Node.js >= 22** (see `engines` in `package.json`) for the test suite and plugin scripts;
   - **Chrome/Chromium** on the `PATH` (or set `CHROME_PATH`) for the functional tests, which drive
     a real headless browser over CDP.

   There is nothing to install: `npm test` runs the native Node test runner against the checked-in
   sources. (A second, optional regression line uses Playwright — see "Regressivo com Playwright"
   in the README.)

3. **Verify the baseline** before changing anything:

   ```bash
   npm test
   ```

## How to submit a change

- **Never push directly to `main`.** Direct pushes are blocked by repository rulesets;
  all changes land through pull requests.
- Work either on a **fork** (external contributors) or on a short-lived **ephemeral branch** in the
  main repository (maintainers), then open a pull request against `main`.
- Keep each branch focused on a single change: small, reviewable pull requests get merged faster.
- Keep your branch up to date by rebasing on `upstream/main` (do not merge
  `main` into your branch).

## Branch naming

Use a short, descriptive prefix:

| Pattern    | Use for                             | Example                    |
| ---------- | ----------------------------------- | -------------------------- |
| `feat/*`   | New functionality                   | `feat/rate-limiter`        |
| `fix/*`    | Bug fixes                           | `fix/null-pointer-parser`  |
| `chore/*`  | Maintenance, tooling, dependencies  | `chore/upgrade-ci`         |

Other conventional prefixes (`docs/*`, `refactor/*`, `test/*`, `perf/*`, `ci/*`) are welcome where
they fit, but `feat/*`, `fix/*` and `chore/*` cover the vast majority of work.

## Commit convention

We use [Conventional Commits](https://www.conventionalcommits.org/). The commit message becomes the
changelog entry and drives the semantic version bump, so the format is enforced.

Accepted:

```text
feat: add exponential backoff to the HTTP client
fix(parser): handle empty input without throwing
docs: document the plugin lifecycle
feat!: drop support for Node 16

feat: add retry support to the HTTP client

BREAKING CHANGE: the client constructor now requires an options object.
```

Rejected:

```text
Fixed bug                          # missing type
FEAT: add stuff                    # type must be lowercase and one of the allowed types
feat: Added stuff                  # subject must be sentence-case or lower-case
feat: add a very long subject that goes way beyond the seventy-two character limit   # header > 72 chars
feat:no space after colon          # missing space after the type separator
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
`revert`. The header must be at most **72 characters**, and the subject must be `sentence-case` or
`lower-case`.

> The `commit-msg` git hook (`.husky/commit-msg`) **rejects invalid messages at commit time** — it
> needs no dependencies and falls back to the same rules as `commitlint.config.js`. Activate the
> hooks once per clone with `git config core.hooksPath .husky`. If your commit was refused, fix the
> message with `git commit --amend` (or `git rebase -i` for older commits) instead of bypassing the
> hook.

## Local quality gates

Run these before opening a pull request — all of them must pass:

```bash
npm test        # full suite: functional (headless Chrome), features, contracts, static assets,
                # the animation law and the DSH plugin
node --check app.js && node --check data.js && node --check expressions.js   # syntax sanity
```

The suite tests **behaviours, not lines**: every visible behaviour of the demo has at least one
test. Add or update tests for every behavioural change; a bug fix should include a regression test
that fails without the fix.

Two project rules are enforced by tests and must never be violated:

- **The visual is sacred** — the SVGs and the demo layout do not change without an explicit user
  request (see `AGENTS.md`).
- **The animation law** — only `transform`/`opacity` animate; `tests/lei-animacao.test.mjs` fails
  any change that breaks it.

## Pull request process

1. **Title = Conventional Commit message.** The title is used as the squash-merge commit message, so
   it must follow the same convention (e.g. `feat: add exponential backoff to the HTTP client`).
2. **Describe what and why** in the body: motivation, approach, alternatives considered. Use the
   [pull request template](.github/PULL_REQUEST_TEMPLATE.md) checklist.
3. **Link related issues** with closing keywords (`Closes #123`) so issues close automatically on
   merge.
4. **Keep it green locally**: `npm test` must pass before requesting review. The same suite runs in
   CI as the required `build` status check.
5. **Review requirements** (enforced by [CODEOWNERS](CODEOWNERS) and repository rulesets):
   - **2 approving reviews** are required (1 for release branches).
   - Owners of the changed paths must review (code owner review is required).
   - Stale approvals are dismissed automatically when new commits are pushed.
   - All required status checks must pass (strict: the branch must be up to date with `main`).
6. **Squash and merge only.** Maintainers merge with the squash strategy and delete the source
   branch afterwards; the pull request title becomes the permanent commit message. Do not merge with
   merge commits or rebase-merge.

## Reporting bugs

- Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) and include a minimal
  reproduction, expected vs. actual behaviour, versions, and environment details.
- Feature ideas go through the
  [feature request template](.github/ISSUE_TEMPLATE/feature_request.md).
- **Security vulnerabilities must not be reported as public issues.** Follow the private process in
  [SECURITY.md](SECURITY.md) instead.

## Recognition

Every contribution counts and every contributor is credited:

- The changelog and release notes attribute merged changes to their authors.
- First-time contributors are thanked in the release announcement that includes their change.
- Significant, sustained contributions are recognised with maintainer/commit bit invitations.

Thank you for helping make dsh-work-game better!
