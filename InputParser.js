import {GameDataLoader} from "./GameDataLoader.js";

const BASE_MODS =
  "hp|lv|str|oc|m|cp|a|d|am|bm|qm|em|n|p|cd|sdm|sam|se|fd|ce|f|fp|npp|ap|bp|qp|ep|acd|bcd|qcd|np|npo|ng|ang|bng|qng|esm|esr|sg|asg|bsg|qsg|ta|cao|aao|cmo|fr|fs|ecm|rng|reducedhp|ff";
const ATTRIBUTES = new Set(["man", "sky", "earth", "star", "beast"]);
const CLASSES = new Set([
  "saber",
  "archer",
  "lancer",
  "rider",
  "caster",
  "assassin",
  "berserker",
  "shielder",
  "ruler",
  "avenger",
  "mooncancer",
  "mooncancerciel",
  "alterego",
  "alteregokiara",
  "foreigner",
  "pretender",
  "beast",
  "beast1",
  "beast1lost",
  "beast2",
  "beast3r",
  "beast3l",
  "beast4",
  "beast6",
  "beastdraco",
  "beasteresh",
  "beastolga",
]);
const FLAGS = new Set([
  "crit",
  "np",
  "b",
  "q",
  "e",
  "second",
  "third",
  "card1",
  "card2",
  "card3",
  "card4",
  "sbg",
  "sversus",
  "cs",
  "mighty",
  "ok",
  "af",
  "qf",
  "bf",
  "nobf",
  "bc",
  "nocap",
]);

export const InputParser = {
  getPattern() {
    const aliasKeys = Object.keys(GameDataLoader.ALIASES);
    const aliasString = aliasKeys.length === 0 ? "" : "|" + aliasKeys.join("|");
    const allBaseKeys = `${BASE_MODS}|${Array.from(ATTRIBUTES).join("|")}|${Array.from(CLASSES).join("|")}|${Array.from(FLAGS).join("|")}`;
    return new RegExp(
      `^(?<type>${allBaseKeys}${aliasString})(?<value>-?\\d*\\.?\\d+)?$`,
      "i",
    );
  },

  extractCardChain(input) {
    const cleaned = input.toLowerCase().replace(/[^a-z0-9-.]+/g, " ");
    const tokens = cleaned.split(/\s+/).filter((t) => t.length > 0);

    for (let i = tokens.length - 1; i >= 0; i--) {
      if (/^[npabqex]+$/.test(tokens[i])) return tokens[i];
    }
    // FIX: Default to 'np' if no chain is found to prevent undefined tokens
    return "np";
  },

  parseBuffs(input) {
    const pattern = this.getPattern();
    const cleaned = input.toLowerCase().replace(/[^a-z0-9-.]+/g, " ");
    let queue = cleaned.split(/\s+/).filter((t) => t.length > 0);

    const buffs = {
      mods: {},
      flags: {},
      cardMods: {1: {}, 2: {}, 3: {}, 4: {}},
      cardFlags: {1: {}, 2: {}, 3: {}, 4: {}},
      enemyHp: Number.MAX_SAFE_INTEGER,
      enemyAttribute: "none",
      enemyClass: "shielder",
      requestedLevel: 0,
      str: 0,
      npLevel: 5,
      overchargeLevel: 1,
      getMod(k) {
        return this.mods[k] || 0;
      },
      getFlag(k) {
        return !!this.flags[k];
      },
    };
    const warnings = [];
    let currentPos = 0;

    while (queue.length > 0) {
      let token = queue.shift();
      if (GameDataLoader.FLAT_BUFF_MACROS[token]) {
        queue = [...GameDataLoader.FLAT_BUFF_MACROS[token], ...queue];
        continue;
      }
      if (GameDataLoader.ALIASES[token]) token = GameDataLoader.ALIASES[token];

      const match = pattern.exec(token);
      if (match && match.groups) {
        const rawType = match.groups.type;
        const type = GameDataLoader.ALIASES[rawType] || rawType;
        const valStr = match.groups.value;

        if (ATTRIBUTES.has(type)) buffs.enemyAttribute = type;
        else if (CLASSES.has(type)) buffs.enemyClass = type;
        else if (!valStr || valStr === "-" || valStr === ".") {
          if (["nobf", "af", "qf", "bf", "bc", "nocap"].includes(type)) {
            buffs.flags[type] = true;
            currentPos = 0;
          } else if (type.startsWith("card")) {
            currentPos = parseInt(type.substring(4)) || 0;
          } else
            currentPos > 0
              ? (buffs.cardFlags[currentPos][type] = true)
              : (buffs.flags[type] = true);
        } else {
          const val = parseFloat(valStr);
          if (!isNaN(val)) {
            if (type === "hp") buffs.enemyHp = val;
            else if (type === "lv") buffs.requestedLevel = val;
            else if (type === "np") {
              buffs.npLevel = Math.max(1, Math.min(5, Math.floor(val)));
            } else if (type === "oc") {
              const ocVal = Math.max(1, Math.min(5, Math.floor(val)));
              buffs.overchargeLevel = ocVal;
              
              const targetMap = currentPos > 0 ? buffs.cardMods[currentPos] : buffs.mods;
              // Explicitly set it instead of adding it, preventing out-of-bounds array lookups
              targetMap["oc"] = ocVal;
            } else {
              const targetMap =
                currentPos > 0 ? buffs.cardMods[currentPos] : buffs.mods;
              if (type === "m") {
                ["am", "bm", "qm"].forEach(
                  (t) => (targetMap[t] = (targetMap[t] || 0) + val),
                );
              } else if (type === "cp") {
                ["ap", "bp", "qp"].forEach(
                  (t) => (targetMap[t] = (targetMap[t] || 0) + val),
                );
              } else targetMap[type] = (targetMap[type] || 0) + val;
            }
          } else warnings.push(token);
        }
      } else warnings.push(token);
    }
    return {buffs, warnings};
  },
};
