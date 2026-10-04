# Damage formula

How Capybara Go! calculates the damage of one hit. Traced from the game's battle code (the `Server` namespace of
the decompiled `HotFix.dll`, game version 1.9.3) and the game tables. It has not been checked against a recorded
hit yet (see [Verification](#verification)).

The battle code is shared by every mode: chapters, bosses, arena, Guild Hegemony and so on all run the same
`HurtBase` pipeline. PVP fights only switch some extra steps on (see [PVP](#pvp)).

## The rule of thumb

**Bonuses in the same stage add together. The stages then multiply.**

So +10% to a stage that already has +200% raises damage by about 3% (3.1 / 3.0), while +10% to a stage that is
still at ×1.0 raises damage by the full 10%. That is why Final Damage, Global DMG and Crit DMG scale so well:
each one is its own multiplier.

Percent attributes are stored as fractions: a profile showing *Final Damage Boost 27.5%* means 0.275 below.
Tenacity, Armor Break, Block and Crit DMG Res are plain numbers.

## Damage of one hit

For a basic attack or skill hit (`HurtAttack` and the element hits), in this order:

```
damage = Base
       × Skill base
       × Crit
       × DMG pool          (Tenacity and Armor Break act here)
       × Global DMG
       × Block
       × Artifact power
       × Final DMG
       × mode-specific multipliers
       × PVP rates
```

then the [after-the-chain steps](#after-the-chain): extra ×2/×3 procs, caps, shields, lifesteal.

| # | Stage | Formula | Clamp | Code |
|---|---|---|---|---|
| 0 | Hit roll | skill-sourced hits (basic attacks included) land if a random 0–1 roll > `Dodge Rate × (1 + MissDoublePercent) − attacker Ignore Dodge Rate`; buff hits always land | — | `SetHurt`, `CalcIsSkillHit` |
| 1 | Base | the skill's own expression, almost always `(ATK − FinalDefense) × coefficient`, where `FinalDefense = DEF × (1 − Ignore DEF %)`; at least 1 | Ignore DEF % 0–1 | `tbgameskill_skill.hurtAttributes`, `GetFinalDefence` |
| 2 | Skill base | `× (1 + base %)` of the hit type: basic attack, Rage skill, combo or counter | — | `OnMathSkillBaseDamage` |
| 3 | Crit | if it crits: `× crit multiplier` ([below](#crit)) | 1.25×–5× | `GetAttackerCritRate`, `GetAttackerCritValue` |
| 4 | DMG pool | `1 + ΣDMG bonuses × (1 − T) − Σenemy DMG reductions × (1 − P)` ([below](#dmg-pool)) | 0.25×–10× | `GetDamageFixPercent` |
| 5 | Global DMG | `(1 + Global DMG + …) × (1 − enemy Global DMG Reduction − …)` | 0.25–5 and 0.10–1 | `GetGlobalDamageAddPercent`, `GetGlobalDamageReductionPercent` |
| 6 | Block | `× (1 − (enemy Block − attacker Block) / 10000)` when the enemy's block chance triggers; players only | reduction ≤ 90% | `GetBlockDamageReductionRate` |
| 7 | Artifact power | artifact skills against a target on its mount HP bar: `1 + Artifact Power − enemy reduction` | ≥ 0.25 | `GetArtifactPowerPercent` |
| 8 | Final DMG | `1 + Final Damage Boost − enemy Final Damage Reduction` (+ conditional and per-type finals, [below](#final-dmg)) | 0.10×–5× | `GetFinalDamageFixPercent` |
| 9 | Mode-specific | Capy Zone, artifact attack, roguelike, monster and special-skill multipliers; ×1 where not used | — | `HurtAttack.OnMathSkillDamageFix` |
| 10 | PVP rates | three PVP multipliers, PVP mode only ([below](#pvp)) | see below | `GetPVPFinalRate`, `GetPVPDamageAddRateTwo`, `GetPVPDamageReductionRateTwo` |
| 11 | Boom Beach / Capymon | mode multipliers; ×1 elsewhere | — | `GetBoomBeachDamageAdd`, `GetCapyMon*` |

All clamps above are constants in `SBattleConst` (code, not tables), except the Tenacity curve (game config 19101).

### ATK, DEF and HP

The stats that go into the base step are themselves built in stages (`MemberAttributeData`):

```
ATK = (flat ATK + sneak-attack bonus + shield-to-ATK) × (1 + ATK % [+ PVP ATK %] + low-HP "backwater" bonus) × (1 + Global ATK) [× hero ATK factor]
DEF = flat DEF × (1 + DEF % [+ PVP DEF %]) × (1 + Global DEF) [× hero DEF factor]
HP  = flat HP × (1 + HP % [+ PVP HP %]) × (1 + Global HP) [× hero HP factor] [× PVP HP rate] × (1 − max-HP reduction)
```

So ATK % and Global ATK multiply each other, the same way as the damage stages.
**In PVP, max HP is multiplied by `PVPMaxHpRate`, or by 5 if the fighter has none** (`SBattleConst.PVPDefaultMaxHpRate`).

### Crit

```
crit chance = Crit Rate − enemy Ignore Crit Rate
            + Basic ATK Crit Rate − enemy's ignore      (basic attacks)
            + Skill Crit Rate − enemy Ignore Skill Crit (skills, legacy, mount, artifact)
            + Rage Skill crit rate                       (Rage skill)
            + weapon crit rate − enemy's ignore          (basic attack and Rage skill)
            + pet / knife / badge bonuses where they apply

crit multiplier = Crit DMG − enemy Crit DMG Reduction
                + Basic ATK crit DMG − enemy's reduction   (basic attacks)
                + Skill Critical Damage − enemy's reduction (skills)
                + combo / knife / badge bonuses where they apply
                → clamped to 1.25 … 5 (+ the fighter's own crit-cap changes)
                × (1 − (enemy Crit DMG Res − Ignore Crit DMG Res) / 10000)   resistance part clamped 0 … 0.70
                → clamped again to 1.25 … 5
```

Everyone starts with Crit DMG 2.0 (×2). A **super crit** (talent or basic-attack proc) doubles the crit multiplier,
clamped to 0.25 … the fighter's super-crit cap.

### DMG pool

```
DMG pool = 1 + ΣDMG bonuses × (1 − T) − Σenemy DMG reductions × (1 − P)      clamped 0.25 … 10
```

Every bonus group that applies to the hit adds into the same two sums:

| Group | Attacker adds | Defender subtracts |
|---|---|---|
| Base | DMG Increase; vs targets above 60% HP; vs bosses; mount skills | DMG Reduction; reductions against the attacker's mount quality and specific mounts (while on a mount HP bar) |
| Other | skill conditions (target shield, target HP above 50% / 70%, attacker or target at low HP); Rage skill full/low-HP bonuses; **Skill DMG** for skills; Verdict badges; artifact skills; **Combo DMG**; **Counter DMG**; per-skill custom bonuses | Skill DMG Reduction, Combo DMG Reduction, Counter reduction |
| State | vs bleeding (and per bleed layer), frozen, stunned, poisoned, burning (and per burn layer), Verdict, Vulnerable (on crits) | shield damage reductions while shielded (and Thunder / Thorn shield versions) |
| Pet | Pet DMG; pet-quality bonuses; the pet's own DMG Increase (pet attacks) | Pet DMG Reduction |
| Skill/buff type | bonuses for the skill's damage-type tags: **Rage Skill DMG** for Rage-skill hits, Skill DMG for skill-tagged hits, weapon- and pet-specific bonuses (e.g. `MojianDamageAdd%`) | matching reductions (e.g. Rage skill reduction) |
| Element / kind | switched on by the hit type ([table](#hit-types)): Physical, Fire, Ice, Electric (Thunder), Poison, Knife, Bleeding, Curse, Frostbite, Ninjitsu, Dragon Flame, Explosion, Falling Sword, Daji aura, … | matching reductions |

Some skills **ignore half of the enemy's reductions** (`m_isIgnoreReduce`: each reduction above × 0.5,
`SBattleConst.IgnoreReduceFactor`).

#### Tenacity and Armor Break

They act only on this pool:

```
T = d / (7000 + 0.7·d)   with d = defender Tenacity − attacker Tenacity Resistance    (0 if d ≤ 0, max 0.85)
P = d / (7000 + 0.7·d)   with d = attacker Armor Break − defender Armor Break Resistance  (0 if d ≤ 0, max 0.85)
```

`7000|0.7` is game config 19101 (`SBattleConst.TenacityPenetrationCalcFactor1/2`); the 85% caps are
`TenacityDamageAddUpLimit` / `PenetrationDamageReduceDownLimit`.

| Gap `d` | 1,000 | 2,000 | 3,000 | 5,385 | 10,000 | 14,700+ |
|---|---|---|---|---|---|---|
| Share cancelled | 13% | 24% | 33% | 50% | 71% | 85% (cap) |

- **Tenacity** cancels part of the attacker's DMG bonuses; **Armor Break** cancels part of the defender's DMG
  reductions. Neither adds damage on its own.
- Only the gap counts: Tenacity is cancelled point for point by the attacker's Tenacity Resistance, Armor Break by
  the defender's Armor Break Resistance.
- They touch nothing outside the DMG pool: not Global DMG, Final DMG, Crit or PVP rates.

### Final DMG

```
Final DMG = 1 + Final Damage Boost − enemy Final Damage Reduction
          + vs targets above 30% / 50% / 70% HP bonuses
          + shield-related final bonuses and reductions
          + per damage type: Final Skill Damage Bonus − enemy Final Skill Damage Reduction,
            Final Rage Skill, Final Basic ATK, Final Knife, Final Combo, Final Counter, Final element, …
          clamped 0.10 … 5
```

## Hit types

Every damage source is one hurt class. They differ in which DMG-pool groups they switch on and which stages they
skip. All of them include Global DMG, Final DMG and PVP rates unless marked.

| Hurt class | DMG pool groups | Crit | Block |
|---|---|---|---|
| `HurtAttack` (basic attacks, skills) | Base, Other, State, Pet, Skill type (+ Physical when a basic/Rage attack counts as knife) | ✓ | ✓ |
| `HurtComboAttack` | Base, Other, State, Pet, Skill type | ✓ | ✓ |
| `HurtPhysicalAttack` | all five + Physical, Ninjitsu | ✓ | ✓ |
| `HurtFireAttack` | all five + Fire, Ninjitsu, Daji aura | ✓ | ✓ |
| `HurtSulfurFireAttack` | all five + Fire | ✓ | ✓ |
| `HurtIceAttack` | all five + Ice | ✓ | ✓ |
| `HurtThunderAttack` | all five + Ninjitsu, Electric, Daji aura (+ stacking per earlier thunder hit) | ✓ | ✓ |
| `HurtNinjitsuAttack` | all five + Ninjitsu | ✓ | ✓ |
| `HurtDragonFlameAttack` | all five + Dragon Flame (+ Global Dragon Flame) | ✓ | ✓ |
| `HurtExplosionAttack` | all five + Explosion | ✓ | ✓ |
| `HurtDajiDemonAuraAttack` | all five + Daji aura | ✓ | ✓ |
| `HurtSkillBuffAttack` | all five + Skill | — | ✓ |
| `HurtComboBuffAttack` / `HurtCounterBuffAttack` | all five + Combo / Counter | — | ✓ |
| `HurtKnifeBuffAttack` | all five + Knife | — | ✓ |
| `HurtFallingSwordBuffAttack` | all five + Falling Sword | — | ✓ |
| `HurtNinjitsuBuffAttack` | Base, Skill type, Ninjitsu | — | ✓ |
| `HurtPunctureBuffAttack` | Base, Other, Skill type | ✓ (+ Skill crit DMG) | — |
| `HurtBuffAttack` | Skill type | — | — |
| `HurtDotBuffAttack` | Skill type, Dot | — | — |
| `HurtPoisonBuffAttack` | Skill type, Poison | — | — |
| `HurtFireBuffAttack` (burn) | Skill type, Fire, Ninjitsu, burn, Daji aura | — | — |
| `HurtBleedBuffAttack` | Physical, Ninjitsu, Bleeding | — | — |
| `HurtCurseBuffAttack` | Skill type, Curse | — | — |
| `HurtFrostbiteBuffAttack` | Skill type, Ice, Frostbite | — | — |
| `HurtThunderBuffAttack` | Skill type, Ninjitsu, Electric, Daji aura | — | — |
| `HurtDajiDemonAuraBuffAttack` | Skill type, Daji aura | — | — |
| `HurtTrueAttack` (true damage) | **none**: no Crit, DMG pool, Global DMG or Block; only Final DMG and PVP rates | — | — |
| `HurtFixedBuffAttack` | none; only buff damage caps | — | — |
| `HurtCritAttack` | crit multiplier only | ✓ | — |

"All five" = Base, Other, State, Pet, Skill type. Damage-over-time and buff hits can't crit and can't be blocked;
true damage ignores every reduction except Final Damage Reduction and the PVP reductions.

### Skills vs basic attacks

- A **skill** is a Small skill or the Rage (Big) skill (`SkillTypeHelper.IsSkillType`). Basic attacks
  (`Ordinary`), legacy, mount, artifact and Capymon skills are separate types; legacy, mount and artifact skills
  still use Skill Crit Rate.
- Skill hits add, per stage: Rage skill base % (stage 2); Skill Crit Rate and Skill Critical Damage (crit); Skill
  DMG / Rage Skill DMG against Skill DMG Reduction (DMG pool); Global Skill DMG against Global Skill DMG Reduction
  (Global DMG); Final Skill / Final Rage Skill against their reductions (Final DMG).
- So **Skill DMG adds with DMG Increase** (and is cut by enemy Tenacity), while **Final Skill Damage Bonus adds with
  Final Damage Boost**, and the two multiply each other.

## After the chain

`HurtBase.Run`, after the multipliers:

1. **Extra procs**: basic attacks, combos and counters can roll ×3 or ×2 damage (`NormalExtraRate3/2`,
   `ComboExtraRate3`, `CounterExtraRate3/2`; `SBattleConst.NormalExtra3/2`).
2. **Damage caps**: a defender with a per-hit cap takes at most `BeHitDamageLimitPercent × max HP`; buff hits with a
   damage-limit buff are capped at a percent of the attacker's ATK; a defender with the crit cap takes at most 30% of
   max HP from a crit. Every landed hit deals at least 1.
3. **Immunity / ignore-damage charges** reduce the hit to 0 or 1.
4. **Shields** absorb damage in order: Senluo shield, skill shield, shield, barrier. Only the rest reaches HP.
5. **Lifesteal**: chance = Lifesteal Rate (+ low-HP, vs-poisoned, counter and lower-HP bonuses), clamped 0–1; heals
   `damage × (1 + Lifesteal) × 0.1 × healing modifier` (`SBattleConst.VampireConstRate` 0.1), at least 1.

## PVP

Fights in PVP mode: Guild Hegemony, Kung Fu, Kung Fu Team, cross-server arena, guild war, Season Mining, friend
duel, trade ship and the battle simulator (their battle controllers set `BattleMode.PVP`). In PVP mode:

- **PVP rates** (stage 10), each clamped:
  - `1 + PVP DMG − enemy PVP DMG Reduction` (0.05–5); Season Mining multiplies a second season pair
  - `× (1 + PVPDamageAddTwo)` (0.25–5)
  - `× (1 − enemy PVPDamageReductionTwo)` (0.05–1)
- **PVP ATK / DEF / HP %** join the ATK, DEF and HP sums, and **max HP × 5** unless the fighter has its own
  `PVPMaxHpRate`.
- **Block** only ever happens between players (it is skipped when either side is a monster or boss).
- Boss and monster bonuses do not apply.

### Guild Hegemony

- Before each duel, `BattleController_GuildKungFu` scales the fighter by the **win-streak debuff**
  (`TbKungFuGuild_KungFuConst` 123): after 1 win 85%, 2 wins 70%, 3 wins 55%, 4 wins 40%, 5 wins 25%, 6 wins 10%,
  7 wins 5%, 8+ wins 2%. It multiplies every attribute marked `parameter == 1` in `TbAttribute_AttrText`: ATK, DEF,
  HP and nearly all the percentages above, including Final DMG, Crit and Tenacity / Armor Break.
- A duel lasts at most 30 rounds (game config 1116).

## Constants

| Constant | Value | Source |
|---|---|---|
| Tenacity / Armor Break curve | `d / (7000 + 0.7·d)` | `TbGameConfig_Config` 19101 |
| Tenacity / Armor Break cap | 85% | `SBattleConst` |
| DMG pool | 0.25 – 10 | `SBattleConst.DamageFixPercentMin/Max` |
| Global DMG | 0.25 – 5 | `GlobalDamageAddPercentMin/Max` |
| Global DMG Reduction factor | 0.10 – 1 | `GlobalDamageReductionPercentMin/Max` |
| Final DMG | 0.10 – 5 | `FinalDamageAddPercentMin/Max` |
| Crit multiplier | 1.25 – 5 (base Crit DMG 2.0) | `CritDamageMin`, `MemberAttributeData.CritDamageMax`, `CritValue` |
| Crit DMG Res | 0 – 70%, per 10000 points | `CritDamageResistMin/Max` |
| Super crit | × 2 | `SuperCritBet` |
| Block | ≤ 90%, per 10000 points | `GetBlockDamageReductionRate` |
| Ignore-reduce skills | enemy reductions × 0.5 | `IgnoreReduceFactor` |
| Extra procs | × 2 / × 3 | `NormalExtra2/3` |
| Lifesteal | × 0.1 | `VampireConstRate` |
| PVP max HP | × 5 by default | `PVPDefaultMaxHpRate` |
| Hegemony streak debuff | 85 / 70 / 55 / 40 / 25 / 10 / 5 / 2 % | `TbKungFuGuild_KungFuConst` 123 |
| Hegemony duel length | 30 rounds | `TbGameConfig_Config` 1116 |

## Verification

- Traced from the decompiled 1.9.3 code (`python tools/traffic/gen_schema.py` writes it to
  `extracted_data/traffic/hotfix_src/<snapshot>/`; the files above are under `Server/`) and the 1.9.3 tables.
  Recheck after game updates: clamps and stage order live in code and can change with any `HotFix.dll` update.
- Not yet checked against a real hit. A duel playback (message 10124, `PVPRecordDto`) carries both fighters' full
  attributes, win counts, the random seed and start/end HP, which is what a check would need; the traffic
  decoder logs it by default (see `tools/traffic/README.md`).
- Exact damage per hit also needs each skill's coefficient and damage-type tags (`tbgameskill_skill`), and the
  random rolls (hit, crit, block, procs) come from the battle's seed.
