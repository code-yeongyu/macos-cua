# QA Evidence PR Readability Report

Date: 2026-06-23
Branch: `code-yeongyu/qa-evidence-pr-readable-20260623`

## Files Changed

- `AGENTS.md`
- `.omo/evidence/20260623-qa-evidence-pr-readable.md`

## Diagnosis

The repo already had an `AGENTS.md` instruction surface and persisted evidence directories under `.omo/evidence` and `.sisyphus/evidence`, but the agent-facing Testing section only named Vitest conventions. It did not tell future PR authors how to translate QA into reviewable PR body evidence.

Prompt defect classification: missing context. The terse or opaque PR evidence behavior was not caused by a wrong rule; the source instruction lacked the reviewer-readable PR evidence contract.

## Before Instruction Behavior

- PR authors could see that tests use Vitest and that local-environment QA evidence matters elsewhere in the README.
- No repo instruction required PR summaries to explain user-facing behavior in plain terms.
- No repo instruction required QA evidence to explain what was tested, what was observed, where artifacts live, or why the evidence is sufficient.
- No repo instruction mapped residual risks to evidence and conclusions.
- Secret-bearing log and environment redaction was not stated near the PR/QA instruction surface.

## After Instruction Behavior

- `AGENTS.md` now keeps the existing Vitest rules and expands the same section into `Testing, QA, and PR Evidence`.
- Future PR bodies are instructed to write for a reviewer who did not watch the session.
- Summary/change descriptions must be grouped by reviewer-relevant surface instead of file lists.
- QA/Evidence entries must include the tested action, observed result, artifact/log path, and sufficiency argument.
- Risk discussion must use risk -> evidence -> conclusion and exclude raw secret-bearing logs, env dumps, tokens, and credentials.

## Prompt Entropy Check

- Before: `AGENTS.md` was 182 words.
- After: `AGENTS.md` is 270 words.
- Growth defense: the added 88 words supply missing repo-specific PR behavior that the model cannot infer from the existing Vitest-only Testing section. The wording is placed at the source section that governs tests and QA rather than appended as a separate bottom note.

## Verification

- Content review: `rg` confirmed the new reviewer-readable QA wording appears only in `AGENTS.md` and this report; no duplicate or conflicting PR evidence instruction surfaced in tracked markdown.
- Whitespace sanity: `git diff --check` exited 0.
- Dependency setup: initial `pnpm check` failed because the fresh worktree had no `node_modules` and `biome` was unavailable; `pnpm install` completed from the existing lockfile.
- Build precondition: `pnpm build` exited 0 and generated workspace outputs needed by package consumers.
- Repository check: `pnpm check` exited 0 after the build precondition. Biome checked 268 files, TypeScript typecheck completed for all packages, and Vitest passed 105 test files / 459 tests.
- Cleanup: `pnpm build` refreshed tracked native binaries as a side effect; those generated binary changes were restored so only the instruction/report change remains in the PR.
- Manual surface: Pending PR body review after PR creation. The PR body will be written using the new `AGENTS.md` evidence contract.

## PR

- URL: Pending.
- Commits:
  - `2c2ed70 docs: clarify PR evidence expectations`
- Merge SHA: Pending.

## Cleanup

- Pending.
