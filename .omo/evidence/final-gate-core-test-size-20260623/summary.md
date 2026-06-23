# Final gate core test-size evidence

Branch: code-yeongyu/gajae-cua-learnings-integration-20260623
Base HEAD before work: 82e0c9b7d21aede448b36141dd440842854a6258

## Scenarios
- Focused split tests: `fnm exec --using v24.17.0 pnpm vitest --run packages/core/src/platform/macos-app-state.test.ts packages/core/src/platform/macos-app-state-windowing.test.ts packages/core/src/platform/macos-app-state-mutators.test.ts packages/core/src/platform/macos-desktop-session.test.ts` -> 4 files passed, 27 tests passed. Artifact: focused-tests.log
- Full check: `fnm exec --using v24.17.0 pnpm check` -> Biome clean, workspace typecheck clean, 116 files passed, 500 tests passed. Artifact: pnpm-check.log
- Full build: `fnm exec --using v24.17.0 pnpm -r build` -> 4 workspace projects built; native outputs restored afterward. Artifact: pnpm-r-build.log
- Pure LOC: all flagged and split/support test files measured under 250 pure LOC. Artifact: pure-loc.txt

## Notes
- `gajae-cua-learnings.md` was present before work and was not staged.
- `packages/core/native/cursor-overlay` and `packages/core/native/libsckit.dylib` were dirtied by build and restored.
