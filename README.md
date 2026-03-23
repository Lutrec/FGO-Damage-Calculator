# FGO Damage Calculator

Web porting of my discord bot's damage calculator designed to calculate complex battle mechanics for the mobile game **Fate/Grand Order (FGO)**. 

The application is built using Vanilla JavaScript and visually disguises its interface as a Discord chat channel. Users can input command strings, and the "bot" will reply with detailed calculation embeds containing damage ranges, NP refund amounts, star generation, etc.

## Live Demo
https://lutrec.github.io/FGO-Damage-Calculator/

## How to Use

Commands are typed directly into the chat box. The parser uses spaces to separate arguments and reads shorthand commands to apply buffs, debuffs, card chains, and enemy stats. `|` can be used to separate groups of buffs to better organise them in the text box (e.g. `nero sbg | a44 am30 | a20 am50 a50 | npaa crit`).

**Basic Syntax Example:**
`nero a44 am30 npaa crit`

### Multi-Wave Battles
You can simulate multi-wave farming setups by using brackets `[ ]`. Any buffs placed outside the brackets are treated as **Global Buffs** and apply to the whole battle. Buffs inside the brackets apply only to that specific wave.

**Example:**
`nero a44 am30 [hp30000 saber a20 am50 a50 npqa crit] [hp45000 saber a20 am50 a50 npaa crit]`

## Storage & Memory
The calculator automatically saves your chat history to your browser's `localStorage` up to 100 messages, ensuring your calculation results remain intact even if you refresh the page. You can click the Trash icon near the help menu to instantly clear the history.

---

## Command Reference
You can mix and match the following arguments in any order. **If a buff is negative (debuff), add a minus sign `-` before the number** (e.g., `d-20`).

### Servant Stats
* Name (e.g., `nero`) or ID (e.g., `5`)
* `np` + `num`: Servant's NP level (default: `np5`)
* `oc` + `num`: Overcharge level (default: `oc1`)
* `lv` / `lvl` / `l` + `num`: Servant's level (default: highest non-grail level)
* `f` / `fou` + `num`: Fou attack stat (default: `f1000`)
* `fp` / `paw` + `num`: Fou paw attack stat
* `ce` / `c` + `num`: Craft Essence attack stat

### Targeted Buffs
* `card1` / `card2` / `card3` / `card4`: Applies any following buffs ONLY to this specific card in the chain (e.g., `card1 am30 card3 bm50`).

### Core Buffs
* `a` / `atk` + `num`: Attack buff/debuff
* `d` / `def` + `num`: Defense buff/debuff (on the enemy)
* `m` / `cm` + `num`: Generic card mod (no extra)
* `bm` / `am` / `qm` / `em` + `num`: Card-specific mod (Buster/Arts/Quick/Extra)
* `n` / `npm` + `num`: NP damage mod
* `npp` / `ns` + `num`: NP damage boost (Oberon's Skill 3)
* `p` / `pmod` + `num`: Power mod
* `cd` + `num`: Critical damage
* `bcd` / `acd` / `qcd` + `num`: Card-specific critical damage
* `se` / `semod` + `num`: Super effective modifier (e.g., Draco's extra damage)
* `sam` / `spe` + `num`: Special attack
* `sdm` + `num`: Special defense (on the enemy)
* `ng` / `npgen` + `num`: NP gain
* `sg` / `stargen` + `num`: Star generation
* `fd` / `dmg` + `num`: Flat damage

### Other Buffs & Flags
* `cp` + `num`: Card-specific strength mod (no extra)
* `ap` / `bp` / `qp` / `ep` + `num`: Card-specific strength mod
* `bng` / `ang` / `qng` + `num`: Card-specific NP gain
* `bsg` / `asg` / `qsg` + `num`: Card-specific star generation
* `fr` / `fg` + `num`: Flat NP refund
* `fs` / `fst` + `num`: Flat star generation
* `crit`: Force critical hits on face cards
* `bf` / `af` / `qf`: Forces Buster/Arts/Quick first-card bonus
* `nobf`: Removes Buster first-card bonus
* `bc`: Forces Buster Chain modifier
* `mc` / `mighty`: Forces Mighty Chain modifier
* `hp` / `ehp` + `num`: Set enemy HP for overkill/success calculations

### Macros
* `super`: Sets `lv100 f2000`
* `hyper`: Sets `lv120 f2000`
* `cs`: Applies maxed Class Score passive buffs
* `grand`: Applies `ce1000` to mimic Grand status
* `sbg`: Applies `ce2400 n80` (Black Grail)
* `sversus`: Applies `ce1000 p100`
* `svictor`: Applies `ce2400 bm15 cd25`
* `sending`: Applies `ce2400 am15 cd25`

### Overrides
* `ta` + `num`: Overrides total attack stat (ignores base/fou/ce)
* `npo` / `npv` + `num`: Overrides NP damage percentage
* `cao` + `num`: Overrides class advantage multiplier
* `aao` + `num`: Overrides attribute advantage multiplier
* `cmo` + `num`: Overrides class attack modifier
* `rng` + `num`: Overrides RNG multiplier (from 0.9 to 1.099)
* `ff` + `num`: Hit count multiplier (e.g., Musashi's Fifth Force)
* `ok`: Forces overkill on all hits
* `reducedhp`: Resets overkill calculation
* `nocap`: Disables standard buff limits