# CI policy and the self-hosted runner

CI is `.github/workflows/ci.yml`. Routine Linux work runs on a dedicated self-hosted runner; GitHub-hosted
machines are used only where their native operating system is the point.

## The dedicated runner

|                |                                                                                |
| -------------- | ------------------------------------------------------------------------------ |
| Host           | Ubuntu 24.04 under WSL2                                                        |
| Name           | `markdown-studio-linux`                                                        |
| Labels         | `self-hosted`, `linux`, `markdown-studio-linux` (plus the automatic `X64`)     |
| Jobs select it | `runs-on: [self-hosted, linux, markdown-studio-linux]` — never `ubuntu-latest` |

Check that it is registered and online under **Settings → Actions → Runners** (it must show the custom label).
Nothing in the repository can prove that; the workflow only requests the label. If the runner is **offline, jobs
queue** (GitHub fails a job that waits 24 hours) and never fall back to a hosted machine. Start it with `./run.sh`
(or as a service via `sudo ./svc.sh install && sudo ./svc.sh start`) inside the runner directory.

Host requirements: Node 22 is installed by `actions/setup-node`; the machine needs `xvfb`, the Electron runtime
libraries (GTK 3, NSS, ALSA — `libgtk-3-0 libnss3 libasound2t64 libgbm1 xvfb`), `git`, `pkill`, and the GitHub CLI
`gh` (used only by the release job). The runner keeps `~/.npm`, Electron and electron-builder caches between runs,
which is why `setup-node` remote caching is enabled only on hosted runs.

## What runs when

| Event                             | Linux gates + E2E + AppImage | Performance benchmark | Windows | macOS  | Draft release |
| --------------------------------- | :--------------------------: | :-------------------: | :-----: | :----: | :-----------: |
| Push to a development branch      |         self-hosted          |           –           |    –    |   –    |       –       |
| Push / merge to `main`            |         self-hosted          |           –           | hosted  | hosted |       –       |
| `workflow_dispatch` (manual)      |         self-hosted          |  self-hosted (input)  | hosted  | hosted |       –       |
| Tag `v*`                          |         self-hosted          |      self-hosted      | hosted  | hosted |  self-hosted  |
| Pull request from a **fork**      |      **GitHub-hosted**       |           –           |    –    |   –    |       –       |
| Pull request from this repository | skipped (the push covers it) |           –           |    –    |   –    |       –       |

- Windows and macOS `needs: linux`, so a failing Linux run does not spend hosted minutes on them.
- The Linux job covers lint, formatting, typecheck, unit tests, build, the security regression suite, export
  rendering E2E, core editor E2E, AppImage packaging and the packaged-app smoke test. Nothing was removed.
- The benchmark is informational (`continue-on-error`) and runs only for manual runs (the `benchmark` input,
  default on) and release tags.
- Releases are unchanged: pushing a `v*` tag builds every platform and creates a **draft pre-release**. Nothing is
  published, tagged or merged automatically.
- No Windows self-hosted runner is assumed. Runners registered to other repositories are not available to this one;
  if you add one to this repository, Windows jobs can be moved to it deliberately (and fork PRs must still never
  reach it).

## Security model (the repository is public)

- **Fork code never reaches the persistent machine.** `runs-on` is
  `pull_request ? ubuntu-latest : self-hosted`, so every `pull_request` event is hosted and the choice fails closed.
  Only `push` events (which need write access to this repository) and manual runs (write access) select the runner.
  The `performance` and `release` jobs run only for tags and manual runs.
- The default `GITHUB_TOKEN` is read-only; only the release job gets `contents: write`, and only for tags.
  `actions/checkout` uses `persist-credentials: false`, so the token is not left in `.git/config` on the runner.
- Fork pull requests get no repository secrets from GitHub.
- Recommended repository settings (Settings → Actions → General): require approval for workflows from outside
  collaborators ("all outside collaborators"); keep "Send write tokens to workflows from pull requests" off; put the
  runner in a runner group limited to this repository. Do not run the runner as root, and keep nothing sensitive in
  the WSL environment or in directories mounted from Windows (`/mnt/c`).
- Jobs `pkill` leftover processes whose command line contains the workspace path, so a failed run cannot leave
  Electron or Xvfb behind on the host.

## Concurrency

Group `ci-<ref>` (`ci-manual-<ref>` for manual runs). A newer push cancels the older run on **development
branches** only. Runs for `main`, release tags and manual runs are never cancelled by a later push.

## Documentation-only changes

A push that touches only `docs/**`, `README.md` or `CHANGELOG.md` still runs lint, formatting, typecheck and unit
tests (the docs link test lives there) but skips the build, E2E, packaging and the native-platform jobs. The skip is
decided by a step inside the job, not by `paths-ignore`, so required status checks are always reported (skipped
jobs count as passing) and never stay pending. Tags, manual runs and fork PRs always run everything. Changes to
`THIRD_PARTY_NOTICES.md`, `LICENSE` or the workflow itself count as code.

## Artifacts and diagnostics

| Artifact                            | When                                                     | Retention            |
| ----------------------------------- | -------------------------------------------------------- | -------------------- |
| `markdown-studio-linux-appimage`    | main, manual, tags (not dev pushes)                      | 3 days (14 for tags) |
| `markdown-studio-windows-installer` | Windows runs                                             | 30 days              |
| `markdown-studio-macos-dmg`         | macOS runs                                               | 14 days              |
| `benchmark-results`                 | benchmark runs                                           | 30 days              |
| `*-test-results`                    | only when the job fails (Playwright traces, screenshots) | 7 days               |

## Running a full cross-platform check by hand

Actions → CI → **Run workflow**, pick the branch. This runs Linux on the self-hosted runner and Windows and macOS
on hosted runners (plus the benchmark unless you untick it).
