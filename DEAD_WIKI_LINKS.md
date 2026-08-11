# Dead Wikipedia links in folklore.json

Audited all 361 distinct `wiki` titles against the Wikipedia API (redirects followed).

- **32 of 415 entries** point at a page that does not exist.
- **116 of 1176 region/era pairs** therefore show no "Read more on Wikipedia" card,
  because every creature they list has a dead title.

The app degrades gracefully: `/api/wiki` tries each of a region's creatures in order and
uses the first live article, so a card only disappears when *all* of them are dead. The
prose and creature list always render regardless. These titles were left exactly as the
data has them rather than guessed at.

| entry key | label | dead title | regions left with no card |
|---|---|---|---|
| `dames_blanches` | Dames Blanches | `Dame_Blanche_(legendary_creature)` | 3 (MC, JE, GG) |
| `abiku` | Abiku | `Àbíkú` | — |
| `medjed` | Medjed | `Medjed_(deity)` | — |
| `gui` | Gui | `Ghost_(Chinese)` | 2 (HK, MO) |
| `bhuta` | Bhuta | `Bhuta_(ghost)` | — |
| `zmey` | Zmey | `Zmei_(Slavic)` | 1 (BG) |
| `cuca` | Cuca | `Cuca_(Brazilian_folklore)` | — |
| `mouros` | Mouros Encantados | `Moura_encantada` | 2 (PT, GI) |
| `al` | Al Basty | `Al_basty` | 2 (KZ, UZ) |
| `stallo` | Stállo | `Stállu` | — |
| `ali_cauc` | Ali | `Al_basty` | 1 (GE) |
| `kaji` | Kaji | `Kaji_(mythology)` | 1 (GE) |
| `nykur_fo` | Nykur | `Nýkur` | 1 (FO) |
| `kludde` | Kludde | `Kludde` | 1 (BE) |
| `champ` | Champ | `Lake_Champlain_monster` | 2 (US-VT, US-NY) |
| `van_meter` | Van Meter Visitor | `Van_Meter_Visitor` | 1 (US-IA) |
| `shunka` | Shunka Warakin | `Shunka_Warakin` | 1 (US-MT) |
| `gugwni` | Nalusa Falaya | `Nalusa_Falaya` | 1 (US-MS) |
| `white_thang` | White Thang | `White_Thang` | — |
| `selbyville` | Selbyville Swamp Monster | `Selbyville_Swamp_Monster` | 1 (US-DE) |
| `nightmarchers2` | Nightmarchers | `Huakaʻi_pō` | — |
| `specter_moose` | Specter Moose | `Specter_Moose` | — |
| `alkali` | Alkali Lake Monster | `Walgren_Lake_State_Recreation_Area` | 1 (US-NE) |
| `oklahoma_octopus` | Oklahoma Octopus | `Lake_Thunderbird_(Oklahoma)` | 1 (US-OK) |
| `colossal_claude` | Colossal Claude | `Colossal_Claude` | 1 (US-OR) |
| `octavius` | The Octagon House Ghosts | `Octagon_House_(Washington,_D.C.)` | 1 (US-DC) |
| `taino_hupia` | Hupia | `Opía` | 1 (US-PR) |
| `plameniti` | Zduhać | `Zduhač` | — |
| `barbegazi` | Barbegazi | `Barbegazi` | — |
| `pukys_by` | Tsmok | `Cmok_(mythology)` | — |
| `moo` | Mo'o | `Moʻo_(mythology)` | 15 (WS, TO, KI, FM, MH, PW, …) |
| `sisimito` | Sisimito | `Sisimite` | 2 (HN, BZ) |

`moo` (Mo’o) is the single biggest cause: it is the only creature listed for many
Pacific island regions across all four eras.
