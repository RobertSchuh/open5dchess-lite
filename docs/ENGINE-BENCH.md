# Engine benchmark (2026-10-10, Node v24.21.0, linux)

All times in ms. classify = classifyMoves (legal move hints), mate = hasLegalAction
(mate/stalemate detection), threats = full threat analysis. Budgets large enough
that nothing times out, so both engines do the same complete work.

## Game: mateAcrossTime (turn_zero)
| position | timelines | moves | classify ref | classify fast | speedup | mate ref | mate fast | threats old | threats new |
|---|---|---|---|---|---|---|---|---|---|
| after action 0 | 1 | 20 | 2.78 | 4.69 | 0.6x | 1.77 | 0.48 | 5.55 | 4.24 |
| after action 1 | 1 | 22 | 2.01 | 0.78 | 2.6x | 0.46 | 0.21 | 6.56 | 3.11 |
| after action 2 | 1 | 32 | 1.01 | 0.48 | 2.1x | 0.27 | 0.14 | 2.71 | 1.55 |
| after action 3 | 1 | 32 | 1.68 | 0.75 | 2.2x | 0.34 | 0.13 | 11.2 | 6.29 |
| after action 4 | 1 | 51 | 2.20 | 0.90 | 2.4x | 0.33 | 0.11 | 4.29 | 4.55 |
| after action 5 | 1 | 43 | 2.57 | 0.71 | 3.6x | 0.23 | 0.25 | 10.8 | 3.34 |
| after action 6 | 1 | 56 | 2.63 | 1.12 | 2.4x | 0.22 | 0.18 | 5.85 | 5.72 |
| after action 7 | 1 | 46 | 3.28 | 3.30 | 1.0x | 0.27 | 0.15 | 29.0 | 5.31 |
| after action 8 | 1 | 66 | 3.77 | 1.29 | 2.9x | 0.31 | 0.06 | 6.03 | 5.22 |
| after action 9 | 1 | 35 | 1.81 | 0.47 | 3.8x | 0.22 | 0.06 | 20.7 | 4.40 |
| after action 10 | 1 | 69 | 3.74 | 0.90 | 4.1x | 0.31 | 0.08 | 3.12 | 1.41 |
| after action 11 | 1 | 35 | 3.22 | 0.50 | 6.4x | 3.64 | 0.23 | - | - |
| after action 12 | 1 | 58 | 3.68 | 0.74 | 4.9x | 0.54 | 0.07 | 5.18 | 1.67 |
| after action 13 | 2 | 100 | 520 | 70.2 | 7.4x | 211 | 24.1 | - | - |
| after action 14 | 3 | 96 | 22.7 | 3.14 | 7.2x | 1.57 | 0.16 | 128 | 26.9 |
| after action 15 | 3 | 133 | 206 | 27.6 | 7.4x | 175 | 20.0 | - | - |
| **total** | | 894 | **783** | **118** | **6.7x** | **397** | **46.4** | **239** | **73.7** |

## Game: checkOnL2 (standard)
| position | timelines | moves | classify ref | classify fast | speedup | mate ref | mate fast | threats old | threats new |
|---|---|---|---|---|---|---|---|---|---|
| after action 0 | 1 | 20 | 0.28 | 0.21 | 1.3x | 0.11 | 0.05 | 0.91 | 0.56 |
| after action 1 | 1 | 20 | 0.28 | 0.17 | 1.7x | 0.09 | 0.03 | 1.64 | 0.87 |
| after action 2 | 1 | 32 | 0.53 | 0.30 | 1.8x | 0.11 | 0.03 | 2.25 | 0.81 |
| after action 3 | 1 | 32 | 0.62 | 0.30 | 2.0x | 0.14 | 0.05 | 5.51 | 1.68 |
| after action 4 | 1 | 51 | 1.14 | 0.54 | 2.1x | 0.13 | 0.04 | 2.36 | 2.28 |
| after action 5 | 1 | 42 | 1.00 | 0.43 | 2.3x | 0.17 | 0.04 | 6.81 | 1.89 |
| after action 6 | 1 | 56 | 1.44 | 0.56 | 2.6x | 0.16 | 0.03 | 4.07 | 1.52 |
| after action 7 | 1 | 45 | 1.30 | 0.43 | 3.0x | 0.19 | 0.04 | 17.9 | 3.53 |
| after action 8 | 1 | 65 | 4.07 | 0.71 | 5.7x | 0.54 | 0.09 | - | - |
| after action 9 | 1 | 48 | 1.65 | 0.48 | 3.4x | 0.18 | 0.03 | 17.8 | 4.00 |
| after action 10 | 1 | 65 | 3.46 | 0.80 | 4.3x | 0.60 | 0.10 | 3.75 | 1.23 |
| after action 11 | 1 | 41 | 2.96 | 0.40 | 7.4x | 3.52 | 0.43 | - | - |
| after action 12 | 1 | 62 | 4.46 | 0.77 | 5.8x | 0.29 | 0.05 | 15.1 | 2.61 |
| after action 13 | 2 | 107 | 507 | 71.0 | 7.1x | 243 | 33.4 | - | - |
| after action 14 | 3 | 99 | 25.6 | 3.24 | 7.9x | 1.01 | 0.13 | 121 | 25.9 |
| after action 15 | 3 | 131 | 886 | 131 | 6.8x | 129 | 20.0 | - | - |
| after action 16 | 4 | 200 | 2047 | 290 | 7.1x | 4.47 | 0.59 | - | - |
| after action 17 | 4 | 86 | 543 | 79.3 | 6.8x | 562 | 76.8 | - | - |
| **total** | | 1202 | **4031** | **580** | **6.9x** | **945** | **132** | **199** | **46.8** |

## Game: claudeVsRob (standard)
| position | timelines | moves | classify ref | classify fast | speedup | mate ref | mate fast | threats old | threats new |
|---|---|---|---|---|---|---|---|---|---|
| after action 0 | 1 | 20 | 0.23 | 0.16 | 1.4x | 0.07 | 0.03 | 0.75 | 0.45 |
| after action 1 | 1 | 20 | 0.23 | 0.13 | 1.7x | 0.07 | 0.02 | 1.23 | 0.71 |
| after action 2 | 1 | 32 | 0.41 | 0.23 | 1.8x | 0.08 | 0.03 | 3.24 | 0.86 |
| after action 3 | 1 | 32 | 0.56 | 0.25 | 2.3x | 0.09 | 0.04 | 3.86 | 1.37 |
| after action 4 | 1 | 51 | 0.92 | 0.43 | 2.2x | 0.11 | 0.03 | 2.76 | 2.11 |
| after action 5 | 1 | 38 | 2.77 | 0.36 | 7.8x | 0.13 | 0.03 | 3.85 | 1.52 |
| after action 6 | 1 | 60 | 1.58 | 0.53 | 3.0x | 0.15 | 0.03 | 3.16 | 1.27 |
| after action 7 | 1 | 46 | 2.05 | 0.48 | 4.3x | 0.16 | 0.03 | 15.3 | 3.08 |
| after action 8 | 1 | 54 | 1.73 | 0.49 | 3.5x | 0.63 | 0.03 | 6.56 | 1.59 |
| after action 9 | 1 | 51 | 1.63 | 0.43 | 3.8x | 0.18 | 0.03 | 8.14 | 2.07 |
| after action 10 | 1 | 54 | 1.92 | 0.46 | 4.2x | 0.19 | 0.03 | 4.01 | 1.28 |
| after action 11 | 1 | 48 | 2.21 | 0.42 | 5.2x | 0.19 | 0.04 | 7.50 | 1.54 |
| after action 12 | 1 | 49 | 3.84 | 0.45 | 8.6x | 0.60 | 0.08 | - | - |
| after action 13 | 1 | 55 | 2.92 | 0.45 | 6.5x | 0.22 | 0.03 | 16.8 | 2.50 |
| after action 14 | 1 | 54 | 3.49 | 0.56 | 6.3x | 0.55 | 0.09 | 4.36 | 1.32 |
| after action 15 | 1 | 48 | 3.29 | 0.40 | 8.3x | 0.28 | 0.03 | 491 | 66.5 |
| after action 16 | 1 | 53 | 3.91 | 0.56 | 7.0x | 0.34 | 0.04 | 25.4 | 3.90 |
| after action 17 | 2 | 107 | 679 | 70.9 | 9.6x | 658 | 71.6 | - | - |
| **total** | | 872 | **713** | **77.7** | **9.2x** | **662** | **72.2** | **598** | **92.1** |

## Generated multi-timeline positions
| position | timelines | moves | classify ref | classify fast | speedup | mate ref | mate fast | threats old | threats new |
|---|---|---|---|---|---|---|---|---|---|
| random seed-game 0, final | 6 | 141 | 892 | 229 | 3.9x | 1.68 | 0.28 | 25.7 | 8.95 |
| random seed-game 1, final | 6 | 138 | 169 | 29.6 | 5.7x | 1.64 | 0.28 | 26.9 | 10.5 |
| random seed-game 2, final | 6 | 159 | 360 | 56.6 | 6.4x | 2.97 | 0.53 | 25.5 | 9.08 |
| random seed-game 3, final | 5 | 118 | 126 | 22.6 | 5.6x | 1.91 | 0.35 | 20.3 | 8.42 |
| **total** | | 556 | **1546** | **338** | **4.6x** | **8.19** | **1.44** | **98.3** | **37.0** |

## Production budgets (classify 4000/500 ms): decisiveness
| position | ref unknown | ref ms | fast unknown | fast ms |
|---|---|---|---|---|
| mateAcrossTime, before final action | 0/96 | 25.4 | 0/96 | 2.97 |
| checkOnL2, before final action | 1/200 | 960 | 0/200 | 297 |
| claudeVsRob, before final action | 0/53 | 6.26 | 0/53 | 0.84 |


# v3 engine benchmark (2026-10-10, Node v24.21.0, linux)

All times in ms. classify = classifyMoves (legal move hints), mate = hasLegalAction.
Budgets large enough that nothing times out: both engines do the same complete work.
v2 = shared/legalMoves.js (fast JS engine); v3 = shared/legalMovesV3.js (Rust->WASM).

## Game: mateAcrossTime (turn_zero)
| position | timelines | moves | classify v2 | classify v3 | speedup | mate v2 | mate v3 | speedup |
|---|---|---|---|---|---|---|---|---|
| after action 0 | 1 | 20 | 3.99 | 2.81 | 1.4x | 0.59 | 0.17 | 3.5x |
| after action 1 | 1 | 22 | 1.78 | 0.22 | 8.2x | 0.26 | 0.03 | 8.2x |
| after action 2 | 1 | 32 | 1.91 | 0.18 | 10.8x | 0.18 | 0.03 | 5.9x |
| after action 3 | 1 | 32 | 1.63 | 0.16 | 10.4x | 0.23 | 0.04 | 5.6x |
| after action 4 | 1 | 51 | 1.46 | 0.24 | 6.2x | 0.11 | 0.04 | 2.8x |
| after action 5 | 1 | 43 | 1.97 | 0.29 | 6.8x | 0.25 | 0.06 | 3.9x |
| after action 6 | 1 | 56 | 3.56 | 0.26 | 13.7x | 0.13 | 0.04 | 3.2x |
| after action 7 | 1 | 46 | 3.20 | 0.25 | 12.8x | 0.14 | 0.04 | 3.2x |
| after action 8 | 1 | 66 | 1.28 | 0.23 | 5.5x | 0.10 | 0.09 | 1.2x |
| after action 9 | 1 | 35 | 0.82 | 0.11 | 7.4x | 0.09 | 0.03 | 3.4x |
| after action 10 | 1 | 69 | 1.18 | 0.22 | 5.3x | 0.11 | 0.03 | 3.7x |
| after action 11 | 1 | 35 | 1.90 | 0.27 | 7.0x | 1.00 | 0.09 | 11.0x |
| after action 12 | 1 | 58 | 1.23 | 0.27 | 4.6x | 0.17 | 0.04 | 3.9x |
| after action 13 | 2 | 100 | 86.4 | 7.78 | 11.1x | 24.5 | 3.03 | 8.1x |
| after action 14 | 3 | 96 | 3.26 | 0.59 | 5.5x | 0.11 | 0.06 | 2.0x |
| after action 15 | 3 | 133 | 20.6 | 2.68 | 7.7x | 20.9 | 3.03 | 6.9x |
| **total** | | 894 | **136** | **16.6** | **8.2x** | **48.8** | **6.85** | **7.1x** |

## Game: checkOnL2 (standard)
| position | timelines | moves | classify v2 | classify v3 | speedup | mate v2 | mate v3 | speedup |
|---|---|---|---|---|---|---|---|---|
| after action 0 | 1 | 20 | 0.26 | 0.06 | 4.1x | 0.04 | 0.02 | 2.4x |
| after action 1 | 1 | 20 | 0.15 | 0.04 | 3.4x | 0.03 | 0.02 | 2.0x |
| after action 2 | 1 | 32 | 0.28 | 0.07 | 4.0x | 0.03 | 0.02 | 1.8x |
| after action 3 | 1 | 32 | 0.50 | 0.08 | 6.5x | 0.08 | 0.02 | 3.4x |
| after action 4 | 1 | 51 | 1.76 | 0.13 | 13.5x | 0.09 | 0.03 | 3.1x |
| after action 5 | 1 | 42 | 1.06 | 0.13 | 8.3x | 0.10 | 0.03 | 3.1x |
| after action 6 | 1 | 56 | 1.54 | 0.17 | 9.1x | 0.07 | 0.03 | 2.4x |
| after action 7 | 1 | 45 | 0.41 | 0.12 | 3.3x | 0.05 | 0.03 | 1.5x |
| after action 8 | 1 | 65 | 1.30 | 0.18 | 7.3x | 0.18 | 0.05 | 3.6x |
| after action 9 | 1 | 48 | 1.21 | 0.14 | 8.8x | 0.08 | 0.04 | 2.0x |
| after action 10 | 1 | 65 | 1.50 | 0.18 | 8.5x | 0.08 | 0.06 | 1.5x |
| after action 11 | 1 | 41 | 0.38 | 0.12 | 3.1x | 0.27 | 0.07 | 4.1x |
| after action 12 | 1 | 62 | 0.67 | 0.16 | 4.3x | 0.04 | 0.02 | 1.8x |
| after action 13 | 2 | 107 | 65.6 | 8.44 | 7.8x | 34.4 | 3.72 | 9.3x |
| after action 14 | 3 | 99 | 3.75 | 0.61 | 6.1x | 0.13 | 0.03 | 4.0x |
| after action 15 | 3 | 131 | 145 | 15.1 | 9.6x | 20.7 | 2.41 | 8.6x |
| after action 16 | 4 | 200 | 348 | 33.0 | 10.5x | 0.62 | 0.13 | 4.7x |
| after action 17 | 4 | 86 | 95.1 | 10.5 | 9.1x | 80.0 | 10.9 | 7.4x |
| **total** | | 1202 | **669** | **69.2** | **9.7x** | **137** | **17.6** | **7.8x** |

## Game: claudeVsRob (standard)
| position | timelines | moves | classify v2 | classify v3 | speedup | mate v2 | mate v3 | speedup |
|---|---|---|---|---|---|---|---|---|
| after action 0 | 1 | 20 | 0.25 | 0.04 | 5.7x | 0.05 | 0.02 | 2.8x |
| after action 1 | 1 | 20 | 0.16 | 0.06 | 2.8x | 0.04 | 0.01 | 3.1x |
| after action 2 | 1 | 32 | 0.29 | 0.08 | 3.6x | 0.03 | 0.01 | 2.4x |
| after action 3 | 1 | 32 | 0.29 | 0.07 | 3.9x | 0.03 | 0.01 | 2.3x |
| after action 4 | 1 | 51 | 0.55 | 0.12 | 4.7x | 0.03 | 0.02 | 2.2x |
| after action 5 | 1 | 38 | 0.40 | 0.11 | 3.7x | 0.05 | 0.02 | 2.7x |
| after action 6 | 1 | 60 | 0.66 | 0.13 | 5.1x | 0.05 | 0.02 | 2.7x |
| after action 7 | 1 | 46 | 0.52 | 0.12 | 4.4x | 0.04 | 0.03 | 1.5x |
| after action 8 | 1 | 54 | 0.57 | 0.15 | 3.8x | 0.03 | 0.02 | 2.0x |
| after action 9 | 1 | 51 | 0.52 | 0.12 | 4.3x | 0.04 | 0.02 | 2.1x |
| after action 10 | 1 | 54 | 1.16 | 0.15 | 7.6x | 0.03 | 0.02 | 1.8x |
| after action 11 | 1 | 48 | 0.48 | 0.14 | 3.4x | 0.03 | 0.02 | 1.7x |
| after action 12 | 1 | 49 | 0.54 | 0.13 | 4.2x | 0.07 | 0.03 | 2.5x |
| after action 13 | 1 | 55 | 0.46 | 0.12 | 3.8x | 0.02 | 0.02 | 1.3x |
| after action 14 | 1 | 54 | 0.56 | 0.12 | 4.5x | 0.07 | 0.03 | 2.5x |
| after action 15 | 1 | 48 | 0.39 | 0.11 | 3.6x | 0.02 | 0.02 | 1.3x |
| after action 16 | 1 | 53 | 0.54 | 0.12 | 4.4x | 0.03 | 0.03 | 1.1x |
| after action 17 | 2 | 107 | 75.9 | 8.34 | 9.1x | 75.3 | 8.50 | 8.9x |
| **total** | | 872 | **84.2** | **10.2** | **8.2x** | **76.0** | **8.83** | **8.6x** |

## Generated multi-timeline positions
| position | timelines | moves | classify v2 | classify v3 | speedup | mate v2 | mate v3 | speedup |
|---|---|---|---|---|---|---|---|---|
| random seed-game 0, final | 6 | 141 | 265 | 22.9 | 11.6x | 0.40 | 0.10 | 3.9x |
| random seed-game 1, final | 6 | 138 | 29.4 | 4.60 | 6.4x | 0.32 | 0.08 | 4.2x |
| random seed-game 2, final | 6 | 159 | 65.5 | 8.54 | 7.7x | 0.65 | 0.12 | 5.5x |
| random seed-game 3, final | 5 | 118 | 26.5 | 4.01 | 6.6x | 0.32 | 0.08 | 4.0x |
| **total** | | 556 | **386** | **40.1** | **9.6x** | **1.69** | **0.38** | **4.5x** |

## Production budgets (classify 4000/500 ms): decisiveness
| position | v2 unknown | v2 ms | v3 unknown | v3 ms |
|---|---|---|---|---|
| mateAcrossTime, before final action | 0/96 | 4.00 | 0/96 | 0.66 |
| checkOnL2, before final action | 0/200 | 370 | 0/200 | 33.2 |
| claudeVsRob, before final action | 0/53 | 0.71 | 0/53 | 0.14 |
