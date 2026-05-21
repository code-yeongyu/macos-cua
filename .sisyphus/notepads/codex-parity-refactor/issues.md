
## T1 Baseline metrics file is fallback values, not live measurements

The `.sisyphus/evidence/baseline-metrics.json` was overwritten by a non-live test
run (screenshotIterations: 1, baselineLive: false). The live numbers the T1
agent reported in their summary (screenshot p50 ~155ms, click+capture p50
~172ms) are NOT in the file.

Action required at T21: re-run baseline with `BASELINE_LIVE=1` BEFORE producing
the comparison report so the "Before" column reflects real screencapture/sips
latency. The bench infrastructure is correct — only the persisted snapshot is
fallback.

## T3 split may have stale Swift cache hit during smoke-test

When running `swift build -c release` after the split, the build output showed
`Build complete! (0.09s)` — this looks suspicious (incremental cache hit).
T5/T6 agents should run `swift package clean && swift build -c release` first
to confirm a fresh build still succeeds after the module split.
