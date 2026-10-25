# Releasing Markdown Studio

## Versioning

[Semantic Versioning](https://semver.org), pre-1.0: each development phase raises the **minor**
version (Phase 3 → `0.3.0`), fixes raise the **patch** version, and `1.0.0` is reserved for the
first stable, code-signed release. `package.json` is the single source of the version; the
installer name, the About dialog and the release title come from it. Update `CHANGELOG.md` in the
same commit.

## What CI verifies

Every push runs `.github/workflows/ci.yml`:

| Job            | Gates                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **linux**      | lint, formatting, typecheck, unit tests, build, **security regression tests**, **export rendering tests**, core editor E2E, AppImage build and a packaged-app smoke test |
| **windows**    | unit tests, build, security, export and core E2E, **installer build**, signature status report, the whole E2E suite against the unpacked app, **silent install + launch of the installed app**, packaged smoke test |
| **macos**      | build, DMG packaging, packaged-app smoke test                                                                                                    |
| **performance** | informational benchmark, uploaded as an artifact                                                                                                |
| **release**    | only for `v*` tags, after all of the above pass                                                                                                  |

Artifacts: `markdown-studio-windows-installer`, `markdown-studio-linux-appimage`,
`markdown-studio-macos-dmg` (and `benchmark-results`). A platform is only described as verified
when its job ran the packaged application; macOS is verified solely by its job's result.

## Making a release

1. Make sure `main` is green on Linux, Windows and macOS.
2. Set the version (`npm version <x.y.z> --no-git-tag-version`), update `CHANGELOG.md`, regenerate
   notices if dependencies changed (`npm run notices`), commit and merge.
3. Tag the merge commit: `git tag v0.3.0 && git push origin v0.3.0`.
4. The **release** job downloads the artifacts and creates a **draft pre-release** whose notes come
   from `scripts/release-notes.mjs` (CHANGELOG section + verification + signing status).
   **Nothing is published automatically.**
5. Review the draft, download and try the installer, then publish it by hand (and clear the
   pre-release flag only for a stable, signed version).

Never create a tag before the gates have passed, and never publish a release whose Windows job is
red.

## Code signing

Signing is optional and uses the official tools through electron-builder; **no certificate or
password is ever committed**.

| Platform | Repository secrets                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| Windows  | `WINDOWS_CERTIFICATE_BASE64` (the `.pfx` file, base64), `WINDOWS_CERTIFICATE_PASSWORD`                      |
| macOS    | `MAC_CERTIFICATE_BASE64` (Developer ID Application `.p12`, base64), `MAC_CERTIFICATE_PASSWORD`, and for notarisation `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |

- With the Windows secrets present, `electron-builder` signs the installer and the
  "Report the signing status" step shows `Valid` and the signer. Without them the same step
  prints **UNSIGNED** in the job summary. A self-signed or fabricated signature is never
  substituted, and an unsigned installer is never called signed.
- SmartScreen reputation is separate from signing: a newly signed installer can still warn until
  it builds reputation (an EV certificate avoids this).
- Do not disable Windows protections as a workaround for missing signing.

**Current status:** no signing credentials are configured in this repository, so the released
artifacts are unsigned.

## Dependencies and notices

New runtime packages must be bundled by the build (`electron-vite`), listed in
`scripts/generate-notices.mjs` and reflected in `THIRD_PARTY_NOTICES.md`
(`npm run notices`). The KaTeX fonts are under the SIL Open Font License; their notice and
licence text are included automatically. `package-lock.json` is committed; use `npm ci`.

## Local packaging

```bash
npm run package:win     # on Windows: NSIS installer in release/<version>/
npm run package:linux   # AppImage
npm run package:mac     # DMG (on macOS)
MARKDOWN_STUDIO_EXECUTABLE=release/0.3.0/win-unpacked/MarkdownStudio.exe npm run test:e2e:packaged
```
