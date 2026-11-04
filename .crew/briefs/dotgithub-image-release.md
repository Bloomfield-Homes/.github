Crew dispatch: dotgithub-image-release 20261104T165310-7d8a2c95

You are a crew worker. A coordinator gave you one brief file and is waiting for your report. Your session is stamped `BH_CREW_ROLE=worker`; `crew whoami` confirms it. That stamp outranks any orchestrator-first rule you read elsewhere: you dispatch nothing, you execute the brief.

- Do exactly what the brief says. Transcribe code blocks verbatim; do not improvise, refactor, or "improve".
- If the brief names a tool, library, file, or approach, use exactly that. If it cannot be used (install fails, missing dependency, it does not do what the brief assumes), stop and report blocked with the blocker and the options in one line. Never substitute another tool or approach, and never repurpose something that already exists in its place.
- Treat every path, name, id and value the brief states as settled; do not re-derive it. Create the files the brief lists within your first 10 tool calls and commit early. If you have made 25 tool calls and written no file, stop and report blocked.
- Report only what you ran and saw. Say 'not verified' for anything you did not run or render, and never describe a result you did not observe.
- Work only inside the current directory and only on files the brief names.
- When `graphify-out/graph.json` exists here, find callers, dependents and the file that owns a symbol with `graphify explain "<Symbol>"` or `graphify query "<question>"` before searching or reading files. One graph call replaces a walk through the tree.
- Run every verification command the brief gives and compare against its expected output.
- If a step fails twice, stop and report blocked with the failing output in one line.
- Never ask the user a question. Nobody is watching this pane. If something is unclear, report blocked.
- If the brief has you start any Docker containers or compose stacks (to build, run, or test something), stop and remove everything you started before your final report: `docker compose down` for anything brought up with compose, `docker rm -f` for anything from `docker run`. This box is shared and thin on memory; leaked containers pile up fast. Never touch a container you did not start.
- Commit your work on the current branch and never push. Pushing is disabled in your environment; the hub pushes after review.
- Browser work (viewing a page, screenshots, UI checks, testing a local dev server) uses Orca's embedded browser through `orca-ide`, never bare `orca` (outside Orca that is the GNOME screen reader). Never use Playwright, Puppeteer, Selenium or a downloaded/headless Chromium, and never run `playwright install`. Flow: `orca-ide tab create --url <url> --json`, `orca-ide goto --url <url>`, `orca-ide snapshot --json` (element tree), `orca-ide screenshot --format png --json` (returns the image path in its JSON), `orca-ide tab close`. With several tabs open, pass `--page <id>` from `orca-ide tab list --json`. Close every tab you opened. Full guide: `orca-ide skills get orca-cli`.
- When the brief changes what a user sees, save before and after screenshots with `orca-ide screenshot` to `tmp/pr-screenshots/` in the worktree, named `NN-before-<slug>.png` and `NN-after-<slug>.png`. Capture only from synthetic or seeded data, never from a database synced from prod. List the paths in your `crew report`.
- When the brief adds or changes a file the app exports or lets a user download (PDF, CSV, XLSX, DOCX, ICS, ZIP), generate one example of it from synthetic or seeded data and save it to `tmp/pr-artifacts/` in the worktree, named `NN-<slug>.<ext>` (for example `01-earnest-money-by-contract-group.pdf`). Never export from a database synced from prod. For a PDF, also save a PNG of its first page to `tmp/pr-screenshots/` as `NN-after-<slug>.png` when `pdftoppm` is available (`pdftoppm -png -r 80 -singlefile -f 1 file.pdf out`). List the paths in your `crew report`.
- Your last action is always the `crew report` command from the brief's final step.
- When the brief asks you to look at an image or render, use the vision tool; if you don't have one, report blocked and don't guess from file names.
- Brief writers: keep live PII data (mailboxes, buyer records) out of crew briefs; the gateway pins a task that shows PII to the local model, whose tool calls then fail.
- If your change alters behavior, configuration, a command, an API, a port or a default, update the docs that describe it (README, docs/, TROUBLESHOOTING, CLAUDE.md/AGENTS.md in that repo) in the same commit. Keep them present-tense and concise. If no doc covers it and a reader would need it, add a short section. List the doc files you changed in your report.
- If you decline a task on content or safety grounds, run `crew report <label> blocked "refused: <one-line reason>"` instead of exiting silently or stalling.


---

# Brief: org-standard image release workflow and setup script

Run: dotgithub-image-release 2026-11-04

Your cwd is a worktree of `Bloomfield-Homes/.github` (public repo, org profile and community files). Don't push, `git fetch`, call Dokploy, or change GitHub settings.

## Why
Every app should deploy the same way: build once in Actions, push to GHCR, tell Dokploy to redeploy. This repo becomes the one place that defines it. The pattern to lift is the lots-api version: `git -C /home/deetss/dev/work/BH/Lots-web/Lots-api show origin/Deetss/crew-lotsapi-ghcr-release:.github/workflows/release.yml`, from the setup-buildx step down. It currently deploys through per-app webhook secrets. Replace those with the Dokploy API and org-level keys.

The repo is public. Keep host names, IPs and IDs out of it. They live in variables.

## Part 1: reusable workflow `.github/workflows/image-release.yml`
`on: workflow_call` with these inputs. Callers will use exactly these names:

| input | required | meaning |
|---|---|---|
| `image` | yes | package name, pushed as `ghcr.io/bloomfield-homes/<image>` |
| `sha` | yes | commit to check out and build |
| `version` | yes | release version |
| `channel` | yes | `production` or `staging` |
| `app-type` | yes | `compose` or `application` (Dokploy resource kind) |
| `build-args` | no | multiline `KEY=value`, passed to build-push (append `SOURCE_COMMIT=<sha>` always) |
| `parity-url` | no | URL polled after a production deploy |
| `parity-field` | no, default `commit` | JSON field read with jq |
| `parity-expect` | no | value that field must reach |

Steps:
1. Checkout `inputs.sha`. Buildx, GHCR login with `GITHUB_TOKEN`, build-push with tags `<version>`, `sha-<short>`, `<channel>`, gha cache, and the label `org.opencontainers.image.source=https://github.com/<caller repo>` so the package links to its repo.
2. Deploy through the Dokploy API: `POST <base>/api/<app-type>.deploy` with header `x-api-key` and body `{"composeId": id}` or `{"applicationId": id}`. **Confirm the endpoint, header and body against docs.dokploy.com before writing it, and cite the page in your report.**
   - `production`: prod target on the Azure instance, then the standby target on the on-prem instance.
   - `staging`: staging target on the Azure instance.
   - Bases: org variables `DOKPLOY_AZURE_URL`, `DOKPLOY_ONPREM_URL`. Keys: org secrets `DOKPLOY_AZURE_API_KEY`, `DOKPLOY_ONPREM_API_KEY`. IDs: caller-repo variables `DOKPLOY_PROD_ID`, `DOKPLOY_STANDBY_ID`, `DOKPLOY_STAGING_ID`.
   - Skip a target with a `::notice::` when its ID, base or key is empty. Fail on a non-2xx. Never print keys or response bodies that could echo them.
3. On `production` with `parity-url` set, poll up to 5 minutes until `parity-field` equals `parity-expect`, as the lots-api version does.

Callers pass `secrets: inherit`. **Check the GitHub docs on whether a called workflow's `vars` context reads the caller's repo and org variables.** If it does, read the IDs and bases from `vars`. If it does not, add them as inputs and say so in the report, since callers would need to change.

Permissions: `contents: read`, `packages: write`.

## Part 2: setup script `scripts/setup-dokploy-deploy`
Bash, executable, `set -euo pipefail`, uses `gh`. One command onboards a repo.

    scripts/setup-dokploy-deploy <repo> [--org]

- `--org` (first time, or to rotate): prompt for `DOKPLOY_AZURE_URL` and `DOKPLOY_ONPREM_URL` and set them as org variables. Prompt for both API keys with `read -rs`, set them as org secrets with `--visibility selected`, and grant `<repo>`.
- Always: grant `<repo>` access to both org secrets and both org variables without re-entering values (the `orgs/{org}/actions/{secrets|variables}/{name}/repositories/{repo_id}` PUT endpoints). Then prompt for the three Dokploy IDs, setting each blank answer as skipped, and write them as repo variables.
- Print what it set (names only) and the remaining manual steps from Part 3.
- Org is `Bloomfield-Homes`. Never echo secret values, never write them to disk.

## Part 3: docs
Add `docs/deploying.md` and link it from `README.md` if one exists (else from `profile/README.md` is wrong, leave the profile alone). Cover:
- the flow (release cut → image → Dokploy → parity);
- the caller snippet a repo adds: a job with `needs: release`, `if: needs.release.outputs.cut == 'true'`, `uses: Bloomfield-Homes/.github/.github/workflows/image-release.yml@main`, `with:` the inputs, `secrets: inherit`, and `permissions: { contents: read, packages: write }`;
- the one-time manual steps the script cannot do: in each Dokploy, create a `github-deploy` member limited to the app's project and generate its API key; add a GHCR registry (a PAT with `read:packages`); switch each app to the Docker image `ghcr.io/bloomfield-homes/<image>:production` or `:staging`;
- rollback: redeploy with an older `<version>` tag.

## Checks
- `actionlint -shellcheck= .github/workflows/image-release.yml` if installed, else `python3 -c "import yaml;yaml.safe_load(open('.github/workflows/image-release.yml'))"`.
- `bash -n scripts/setup-dokploy-deploy`; `shellcheck` it if installed.

## Commit
- Subject: `ci: org image release workflow`. No trailers.

When finished, run `crew report dotgithub-image-release done "<files, Dokploy API citation, vars-context finding, lint output>"`. If blocked, run `crew report dotgithub-image-release blocked "<reason>"`.

Verify:
    test -x scripts/setup-dokploy-deploy && bash -n scripts/setup-dokploy-deploy && python3 -c "import yaml;d=yaml.safe_load(open('.github/workflows/image-release.yml'));assert 'workflow_call' in d[True]" && grep -q 'x-api-key' .github/workflows/image-release.yml && ! grep -rniE 'bloomfieldhomes\.org|bloomfield\.work|192\.168|10\.50' .github scripts docs
Expected: the workflow is callable and uses the Dokploy API, the script parses, and no internal hosts are in the public repo.


---

## FINAL STEP (mandatory)

If this task started any Docker containers or compose stacks, stop and remove
them now (`docker compose down` / `docker rm -f`) before reporting. Never
touch a container you did not start.

When you have finished every step above, run exactly:

    crew report dotgithub-image-release done "<one-line summary of what you did>"

If you cannot proceed (a step failed twice, something is missing, or the plan is wrong), run instead:

    crew report dotgithub-image-release blocked "<one-line reason>"

Do not create or modify any file outside the paths this brief allows.
