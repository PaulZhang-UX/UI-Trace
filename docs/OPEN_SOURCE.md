# Open Source Publishing Guide

This project can be published as a GitHub repository, but generated captures and local release artifacts should stay out of source control.

## What To Commit

- `assets/`
- `docs/`
- `extension/`
- `figma-plugin/`
- `samples/`
- `schemas/`
- `src/`
- `tools/`
- `viewer/`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`
- `.gitignore`

## What Not To Commit

The `.gitignore` excludes these by default:

- `exports/` captured website JSON and screenshots.
- `dist/` generated release zip packages.
- `tmp/` temporary preview files.
- root-level `tmp-*.png` screenshots.
- local editor, OS, log, and environment files.

Captured JSON can contain page text, URLs, account-specific labels, screenshot data, and other content from the browser session. Treat it as private unless you intentionally create a sanitized sample.

## First-Time GitHub Flow

1. Install Git or GitHub Desktop.
2. Create a new empty GitHub repository, for example `ui-trace`.
3. From the project root, initialize Git:

```powershell
git init
git add .
git commit -m "Initial UI Trace prototype"
git branch -M main
git remote add origin https://github.com/<your-name>/ui-trace.git
git push -u origin main
```

If using GitHub Desktop, choose this folder as the local repository, review the changed file list, confirm ignored folders are not included, then publish to GitHub.

## Release Packages

Keep generated zip packages out of Git. Build them locally when needed:

```powershell
.\tools\package-release.ps1 -Version "0.1.0" -Force
```

Attach the generated zip files from `dist/` to a GitHub Release instead of committing them to the repository.

