# Detailed Predictive Model Analysis (V9)

## 1. Global Performance metrics
| Metric | Value |
|---|---|
| **MAE** (Mean Absolute Error) | **2.56 hours** |
| **Median AE** | **0.03 hours** |
| **RMSE** (Root Mean Sq Error) | 22.92 hours |
| **MAPE** (Median % Error) | 0.6% |
| **Sample Size** | 6905 games |

## 2. Performance by Genre
*Note: Games can belong to multiple genres.*

| Genre | Count | MAE (Hours) | Median % Error | Bias (Mean Error) |
|---|---|---|---|---|
| Erotic | 28 | 0.03h | 0.4% | -0.02h |
| Casual | 45 | 0.26h | 0.4% | 0.10h |
| Simulation | 35 | 0.31h | 0.3% | 0.14h |
| Indie | 3631 | 0.45h | 0.4% | -0.11h |
| Platform | 1134 | 0.58h | 0.4% | -0.15h |
| Point-and-click | 289 | 0.59h | 0.4% | -0.04h |
| Puzzle | 1364 | 0.60h | 0.4% | -0.13h |
| Educational | 96 | 0.64h | 0.4% | 0.46h |
| Thriller | 179 | 0.66h | 0.5% | -0.18h |
| Horror | 630 | 0.67h | 0.5% | -0.08h |
| Mystery | 493 | 0.79h | 0.4% | -0.15h |
| Romance | 117 | 0.82h | 0.4% | -0.24h |
| Visual Novel | 270 | 0.97h | 0.4% | -0.14h |
| Party | 252 | 1.07h | 0.6% | 0.18h |
| Kids | 336 | 1.19h | 0.4% | -0.43h |
| Comedy | 641 | 1.24h | 0.5% | -0.49h |
| Music | 179 | 1.38h | 0.4% | 0.67h |
| Survival | 408 | 1.38h | 0.6% | -0.46h |
| Fighting | 369 | 1.39h | 0.9% | -0.17h |
| Quiz/Trivia | 18 | 1.40h | 1.0% | 1.25h |
| Adventure | 4016 | 1.50h | 0.5% | -0.62h |
| Arcade | 1031 | 1.60h | 0.5% | -0.96h |
| Stealth | 264 | 1.63h | 0.8% | -0.60h |
| Sci-Fi | 1225 | 1.80h | 0.6% | -0.82h |
| Historical | 371 | 1.83h | 0.6% | -0.25h |
| Card & Board Game | 157 | 1.86h | 0.7% | -0.45h |
| Racing | 326 | 1.96h | 0.8% | -0.43h |
| Pinball | 13 | 2.04h | 0.9% | 1.15h |
| Shooter | 1060 | 2.12h | 0.6% | -1.33h |
| Action | 4180 | 2.27h | 0.6% | -1.22h |
| Drama | 314 | 2.66h | 0.7% | -1.38h |
| Hack and slash/Beat 'em up | 457 | 3.01h | 0.9% | -1.03h |
| RPG | 46 | 3.09h | 0.6% | -1.95h |
| Tactical | 257 | 3.23h | 0.9% | -1.15h |
| Real Time Strategy (RTS) | 147 | 3.24h | 0.7% | -0.21h |
| Sandbox | 277 | 3.56h | 0.4% | -2.57h |
| Turn-based strategy (TBS) | 362 | 3.57h | 0.8% | -1.55h |
| Open world | 467 | 3.66h | 0.9% | -2.17h |
| Role-playing (RPG) | 1967 | 3.69h | 0.6% | -2.05h |
| Fantasy | 1720 | 3.77h | 0.7% | -1.93h |
| Business | 114 | 4.16h | 0.5% | -0.93h |
| Strategy | 1316 | 4.30h | 0.6% | -2.82h |
| 4X (explore, expand, exploit, and exterminate) | 39 | 4.62h | 0.7% | -1.90h |
| Simulator | 1253 | 5.00h | 0.6% | -3.17h |
| Warfare | 221 | 7.85h | 1.2% | -5.00h |
| Sport | 406 | 9.84h | 1.5% | -4.72h |
| Non-fiction | 114 | 20.89h | 14.6% | -11.44h |

## 3. Accuracy Distribution
How many games fall within specific error ranges?

- **Perfect (<30 min error)**: 5102 games (73.9%)
- **Great (<1 hour error)**: 5376 games (77.9%)
- **Solid (<20% error)**: 5745 games (83.2%)

## 4. Problematic Outliers
### Top 10 Worst Overestimates (Model says Long, Reality is Short)
| Title | Predicted | Actual | Error |
|---|---|---|---|
| Warcraft III: Reforged | 154.1h | 32.5h | +121.7h |
| The Golf Club | 106.2h | 9.8h | +96.4h |
| Pro Evolution Soccer 2017 | 112.4h | 37.5h | +74.9h |
| MLB 18: The Show | 74.0h | 6.6h | +67.4h |
| Football Manager 2023 | 170.8h | 103.6h | +67.1h |
| Pro Evolution Soccer 2018 | 113.9h | 47.5h | +66.4h |
| R.B.I. Baseball 21 | 68.9h | 10.0h | +58.9h |
| Pro Evolution Soccer 2015 | 104.6h | 47.0h | +57.6h |
| eFootball 2022 | 97.9h | 52.8h | +45.1h |
| Farming Simulator 18 | 44.6h | 1.4h | +43.3h |

### Top 10 Worst Underestimates (Model says Short, Reality is Long)
| Title | Predicted | Actual | Error |
|---|---|---|---|
| League of Legends | 18.5h | 1182.5h | -1164.0h |
| World of Tanks | 7.1h | 1046.7h | -1039.6h |
| Out of the Park Baseball 16 | 6.0h | 700.2h | -694.2h |
| Phantasy Star Online 2 | 162.7h | 460.0h | -297.3h |
| Clicker Heroes | 149.8h | 419.5h | -269.7h |
| Football Manager 2015 | 188.0h | 452.6h | -264.5h |
| The Golf Club 2 | 116.3h | 341.0h | -224.7h |
| Football Manager 2018 | 201.3h | 353.8h | -152.4h |
| World of Warcraft Classic | 146.8h | 272.4h | -125.6h |
| Football Manager 2016 | 204.2h | 328.2h | -123.9h |

## 5. Insight & Recommendations
Based on the data above:
- **Best Genres**: Look for low MAE. These are where the model is highly confident.
- **Worst Genres**: Look for high MAE/Bias. These usually need specific interaction features (like Simulators or MMOs).
- **Bias**: If Bias is negative, we consistently underestimate this genre (needs 'Mega-Game' flag). If positive, we overestimate (maybe confusing DLCs for Main games).
