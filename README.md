

# FGO Damage Calculator

Web porting of my discord bot's damage calculator designed to calculate complex battle mechanics for the mobile game **Fate/Grand Order (FGO)**. 

The application is built using Vanilla JavaScript and visually disguises its interface as a Discord chat channel. Users can input command strings, and the "bot" will reply with detailed calculation embeds containing damage ranges, NP refund amounts, star generation, etc.

## Live Demo
https://lutrec.github.io/FGO-Damage-Calculator/

## How to Use

Commands are typed directly into the chat box. The parser uses spaces to separate arguments and reads shorthand commands to apply buffs, debuffs, card chains, and enemy stats. `|` can be used to separate groups of buffs to better organise them in the text box (e.g. `nero sbg | a44 am30 | a20 am50 a50 | npaa crit`).

**Basic Syntax Example:**
`nero a44 am30 npaa crit`

### Command Reference
You can mix and match the following arguments in any order:

* **Servant:** 
Enter the servant's name (e.g., `nero`) or ID (e.g., `5`).
* **Card Chains:** 
Define the attack sequence using `np` (default chain if not specified), `a`, `b` and `q` (e.g., `npbb`).
* **Enemy Stats:** 
  * HP: `hp+num` (Calculates overkill and success probability).
  * Class: `saber`, `archer`, `lancer`, `ruler`, `beast3l`, etc.
  * Attribute: `man`, `sky`, `earth`, `star`, `beast`.
* **Servant Stats:**
  * `np1` to `np5` sets the NP Level, `5` by default.
  * `lv+num` sets the servant level, base level by default.
  * `fou/f+num` sets the Fou attack, `1000` by default.
  * `fp/paw+num` sets the Fou Paw attack for facecards, `0` by default.
  * `ce+num` sets the Craft Essence attack, `0` by default.
* **Core Buffs:**
  * `atk30` / `def-20` (ATK Up / Enemy DEF Down)
  * `am50` / `bm50` / `qm50` (Card effectiveness)
  * `n30` (NP Damage Up)
  * `p20` (Special Damage / Power Mod)
  * `cd50` (Critical Damage Up)
* **Advanced Modifiers:**
  * `se150` (Super Effective Mod for specific NPs)
  * `fd500` (Flat damage addition)
  * `ng30` (NP Generation Up)
  * `sg30` (Star Generation Up)

### Multi-Wave Battles
You can simulate multi-wave farming setups by using brackets `[ ]`. Any buffs placed outside the brackets are treated as **Global Buffs** and apply to the whole battle. Buffs inside the brackets apply only to that specific wave.

**Example:**
`nero a44 am30 [hp30000 saber a20 am50 a50 npqa crit] [hp45000 saber a20 am50 a50 npaa crit]`

### Macros
The calculator includes a macro system for quick setup:
* `cs` - Automatically applies maxed Class Score passive buffs.
* `super` - Sets Servant to Lv. 100 with 2000 Fous.
* `hyper` - Sets Servant to Lv. 120 with 2000 Fous.
* `sbg` - Applies Black Grail stats (CE 2400 ATK, 80% NP Damage).


## Storage & Memory
The calculator automatically saves your chat history to your browser's `localStorage` up to 100 messages, ensuring your calculation results remain intact even if you refresh the page. You can click the Trash icon near the help menu to instantly clear the history.