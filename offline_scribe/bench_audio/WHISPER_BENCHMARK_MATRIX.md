# Whisper.cpp Benchmark Matrix (English + Hindi + Tamil)

Benchmark setup: real speech clips, whisper.cpp CLI, 2 runs per setting, models=`base/small`, threads=`2/4/8`.

## Best-per-model by language

| Language | Model | Best Threads | Avg Latency (s) | Similarity Proxy |
|---|---:|---:|---:|---:|
| en | base | 8 | 3.668 | 1.0 |
| en | small | 4 | 10.522 | 0.995 |
| hi | base | 4 | 4.846 | 0.215 |
| hi | small | 4 | 18.177 | 0.814 |
| ta | base | 4 | 5.875 | 0.75 |
| ta | small | 4 | 18.204 | 0.857 |

## Raw grid (all runs aggregated)

| Sample | Lang | Model | Threads | Avg (s) | Min (s) | Max (s) | Similarity |
|---|---|---|---:|---:|---:|---:|---:|
| english_jfk | en | base | 2 | 4.97 | 4.849 | 5.091 | 1.0 |
| english_jfk | en | base | 4 | 4.232 | 3.775 | 4.69 | 1.0 |
| english_jfk | en | base | 8 | 3.668 | 3.577 | 3.758 | 1.0 |
| english_jfk | en | small | 2 | 15.122 | 14.385 | 15.858 | 0.995 |
| english_jfk | en | small | 4 | 10.522 | 10.227 | 10.817 | 0.995 |
| english_jfk | en | small | 8 | 11.887 | 11.67 | 12.103 | 0.995 |
| hindi_fleurs | hi | base | 2 | 6.034 | 5.857 | 6.211 | 0.215 |
| hindi_fleurs | hi | base | 4 | 4.846 | 4.645 | 5.048 | 0.215 |
| hindi_fleurs | hi | base | 8 | 6.505 | 5.733 | 7.277 | 0.215 |
| hindi_fleurs | hi | small | 2 | 23.705 | 23.657 | 23.753 | 0.814 |
| hindi_fleurs | hi | small | 4 | 18.177 | 17.482 | 18.872 | 0.814 |
| hindi_fleurs | hi | small | 8 | 20.377 | 19.588 | 21.165 | 0.814 |
| tamil_fleurs | ta | base | 2 | 7.899 | 7.895 | 7.904 | 0.75 |
| tamil_fleurs | ta | base | 4 | 5.875 | 5.668 | 6.082 | 0.75 |
| tamil_fleurs | ta | base | 8 | 12.541 | 10.845 | 14.236 | 0.75 |
| tamil_fleurs | ta | small | 2 | 22.651 | 22.612 | 22.691 | 0.857 |
| tamil_fleurs | ta | small | 4 | 18.204 | 17.597 | 18.81 | 0.857 |
| tamil_fleurs | ta | small | 8 | 19.046 | 17.787 | 20.305 | 0.857 |

## Recommendation

- Default model: `base` for mobile/iPad backend latency/quality balance on this server.
- Default threads: `4` (good stability under concurrent load; `8` can be faster but may contend with other services).
- Use `small` only for high-accuracy workflows where ~2-3x latency is acceptable.