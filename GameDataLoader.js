/**
 * @file GameDataLoader.js
 * Handles the asynchronous loading, normalization, and caching of static game data.
 * Serves as the single source of truth for base servant stats, aliases, and relations.
 */
export const GameDataLoader = {
  CLASS_ATTACK_MODIFIERS: {},
  ATTRIBUTE_RELATIONS: {},
  CLASS_RELATIONS: {},
  ENEMY_CLASS_MODS: {},
  BUFF_MACROS: {},
  FLAT_BUFF_MACROS: {},
  SERVANT_MAP: {},
  ALIASES: {},

  /**
   * Initializes the data layer by fetching all required JSON resources concurrently.
   * Maps internal aliases and nickname associations.
   * @returns {Promise<void>}
   */
  async initialize() {
    console.log("Loading FGO Data...");
    const [
      attrRel,
      aliases,
      macros,
      classMods,
      classRel,
      enemyMods,
      nicknames,
      servants,
    ] = await Promise.all([
      this.fetchJson("./data/attributeRelation.json", {}),
      this.fetchJson("./data/buffAliases.json", {}),
      this.fetchJson("./data/buffMacros.json", {}),
      this.fetchJson("./data/classAttackModifier.json", {}),
      this.fetchJson("./data/classRelation.json", {}),
      this.fetchJson("./data/enemyClassServerMod&Rate.json", {}),
      this.fetchJson("./data/nicknames.json", {}),
      this.fetchJson("./data/servantData.json", []),
    ]);

    this.CLASS_ATTACK_MODIFIERS = this.lowercaseKeys(classMods);
    this.ATTRIBUTE_RELATIONS = this.lowercaseNestedKeys(attrRel);
    this.CLASS_RELATIONS = this.lowercaseNestedKeys(classRel);
    this.ENEMY_CLASS_MODS = this.lowercaseKeys(enemyMods);

    this.BUFF_MACROS = macros;
    for (const [k, v] of Object.entries(macros))
      this.FLAT_BUFF_MACROS[k.toLowerCase()] = v.toLowerCase().split(/\s+/);

    const flatAliases = {};
    for (const [internalKey, aliasList] of Object.entries(aliases)) {
      for (const alias of aliasList)
        flatAliases[alias.toLowerCase()] = internalKey.toLowerCase();
    }
    this.ALIASES = flatAliases;

    const servantById = {};
    for (const data of servants) {
      const servant = this.createServantRecord(data);
      servantById[servant.id] = servant;
      this.SERVANT_MAP[servant.id.toString()] = servant;
    }

    for (const [idStr, nicks] of Object.entries(nicknames)) {
      const svt = servantById[parseInt(idStr)];
      if (svt) {
        for (const nick of nicks) this.SERVANT_MAP[nick.toLowerCase()] = svt;
      }
    }
    console.log("Data loaded successfully.");
  },

  async fetchJson(url, fallback) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error(`Failed to fetch ${url}`, e);
      return fallback;
    }
  },

  lowercaseKeys(obj) {
    const res = {};
    for (const [k, v] of Object.entries(obj)) res[k.toLowerCase()] = v;
    return res;
  },

  lowercaseNestedKeys(obj) {
    const res = {};
    for (const [k, v] of Object.entries(obj))
      res[k.toLowerCase()] = this.lowercaseKeys(v);
    return res;
  },

  /**
   * Normalizes raw servant JSON data into a standardized servant object.
   * @param {Object} data - Raw servant data object.
   * @returns {Object} Standardized servant record.
   */
  createServantRecord(data) {
    const convertHitDist = (arr) => (arr ? arr.map((x) => x / 100.0) : []);
    const npDamageStats = {};
    const npDamageStatsOC = {};
    const npCardTypes = {};

    const processNp = (key, colour, dmgMod, ocMod) => {
      if (colour) {
        if (dmgMod) npDamageStats[key] = dmgMod;
        if (ocMod) npDamageStatsOC[key] = ocMod;
        npCardTypes[key] = colour;
      }
    };

    processNp("0", data.npColour, data.npDamageMod, data.npDamageModOc);
    processNp("1", data.npColour1, data.npDamageMod1, data.npDamageModOc1);
    processNp("2", data.npColour2, data.npDamageMod2, data.npDamageModOc2);
    processNp("3", data.npColour3, data.npDamageMod3, data.npDamageModOc3);
    processNp("4", data.npColour4, data.npDamageMod4, data.npDamageModOc4);
    processNp("5", data.npColour5, data.npDamageMod5, data.npDamageModOc5);

    return {
      id: data.id,
      name: data.name,
      link: data.link,
      attackStat: data.atkDefault,
      attackMax: data.atkMax,
      attackGrowth: data.atkGrowth || [],
      npDamageStats,
      npDamageStatsOC,
      classType: data.class ? data.class.toLowerCase() : "shielder",
      attribute: data.attribute ? data.attribute.toLowerCase() : "earth",
      passiveStat: data.passive || "",
      levelDefault: data.levelDefault,
      starRate: data.starGen,
      npRateCard: data.npGainCard,
      npRateNP: data.npGainNP,
      artsHits: data.hitsDistribution?.a?.length || 0,
      busterHits: data.hitsDistribution?.b?.length || 0,
      quickHits: data.hitsDistribution?.q?.length || 0,
      extraHits: data.hitsDistribution?.e?.length || 0,
      npHits: data.hitsDistribution?.np?.length || 0,
      npCardTypes,
      ocMechanicType: data.ocMechanicType || "standard",
      hitDistributions: {
        a: convertHitDist(data.hitsDistribution?.a),
        b: convertHitDist(data.hitsDistribution?.b),
        q: convertHitDist(data.hitsDistribution?.q),
        e: convertHitDist(data.hitsDistribution?.e),
        [`np${data.npColour}0`]: convertHitDist(data.hitsDistribution?.np),
      },
    };
  },
};