# Waiting Room Monitor Benchmark Ledger

## Metadata

Date: 2026-10-24  
Plan: [2026-10-24-waiting-room-monitor-plan.md](2026-10-24-waiting-room-monitor-plan.md)  
Evidence: [2026-10-24-waiting-room-monitor-evidence.md](2026-10-24-waiting-room-monitor-evidence.md)  
Benchmark: [2026-10-24-waiting-room-monitor-benchmark.md](2026-10-24-waiting-room-monitor-benchmark.md)  
Actual status: [2026-10-24-waiting-room-monitor-actual-status.md](2026-10-24-waiting-room-monitor-actual-status.md)

## Benchmark Rules

Measured numbers only; planned engineering thresholds remain in master plan, not fabricated baseline rows. Record device/participant/window/reference conditions in evidence; put numeric comparisons here after actual measurement. Baseline/latest/final are not filled from targets. Counts below come from actual repository/test audit, not an implemented product. A test-file load failure is not a failed clinical case.

## B0 — P0 baseline measurements

| Phase | Metric | Unit | Baseline | Latest | Final | Target | Delta | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | Legacy tests passing | count | 8 | 8 | not final | n/a historical | 0 | E0-P0A-TEST1 |
| P0 | Legacy failed test-file loads | count | 1 | 1 | not final | n/a historical | 0 | E0-P0A-TEST1 |
| P0 | Legacy TypeScript product modules | count | 2 | 2 | not final | n/a historical | 0 | E0-P0A-SRC1, E0-P0A-REL1 |
| P0 | Legacy test files | count | 3 | 3 | not final | n/a historical | 0 | E0-P0A-REL1 |

## Future measured sections

No P1–P5 measurements yet. When collected, add: phone attempted/usable windows and pulse error; actual frame rate/cadence/gaps; rPPG pulse agreement and independent-reference error; breathing error and usable rate; recognition false assignments/uncertainty counts on stated volunteers; visible-request latency; Gemini/TTS latency; video-stale delay; UI viewport/overflow results. Include exact sub-slice evidence IDs and units. Keep the measurement target beside measured value only after a real attempt exists.

## Non-Benchmarkable Notes

Spec approval, proposed APIs, task ownership, and model/provider documentation are not numerical performance evidence. No device accuracy, usability rate, capacity, or API latency is currently measured for this project.
