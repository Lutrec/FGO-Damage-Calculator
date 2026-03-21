

# FGO Damage Calculator

Web porting of my discord bot's damage calculator designed to calculate complex battle mechanics for the mobile game **Fate/Grand Order (FGO)**. 

The application is built using Vanilla JavaScript and visually disguises its interface as a Discord chat channel. Users can input command strings, and the "bot" will reply with detailed calculation embeds containing damage ranges, NP refund amounts, star generation, and overkill thresholds.

## Live Demo
*(Once your GitHub Pages site is live, put the link here! e.g., https://[your-username].github.io/[repo-name]/)*

## How to Use

Commands are typed directly into the chat box. The parser uses spaces to separate arguments and reads shorthand commands to apply buffs, debuffs, card chains, and enemy stats. 

**Basic Syntax Example:**
`nero a44 am30 npaa crit`

### Command Reference
You can mix and match the following arguments in any order:

* **Servant:** Enter the servant's name (e.g., `nero`) or ID (e.g., `5`).
* **Card Chains:** Define the attack sequence using `np` (default chain if not specified), `a`, `b` and `q` (e.g., `npbb`).
* **Enemy Stats:** * HP: `hp100000` (Calculates overkill and success probability).
  * Class: `saber`, `archer`, `lancer`, `ruler`, `beast3l`, etc.
  * Attribute: `man`, `sky`, `earth`, `star`, `beast`.
* **Servant Stats:**
  * `np1` to `np5` (Sets NP Level, np5 by default)
  * `lv100` (Sets custom level)
  * `fou2000` or `f2000` (Fou ATK, 1000 by default)
  * `ce1000` (Craft Essence ATK)
  * `paw500` or `fp500` (Fou Paw ATK for facecards)
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
`nero a44 am30 [hp30000 saber a20 am50 a50] [hp45000 saber a20 am50 a50 ] [np b b ex buster30 hp120000 berserker]`

### ⚡ Macros
The calculator includes a macro system for quick setup:
* `cs` - Automatically applies maxed Class Score passive buffs.
* `super` - Sets Servant to Lv. 100 with 2000 Fous.
* `hyper` - Sets Servant to Lv. 120 with 2000 Fous.
* `sbg` - Applies Black Grail stats (CE 2400 ATK, 80% NP Damage).


## Storage & Memory
The calculator automatically saves your chat history to your browser's `localStorage` up to 100 messages, ensuring your calculation results remain intact even if you refresh the page. You can click the Trash icon near the help menu to instantly clear the history.