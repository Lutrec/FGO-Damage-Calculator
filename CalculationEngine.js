/**
 * @file CalculationEngine.js
 * @description The core orchestrator for the FGO Damage Calculator.
 * Delegates strict mathematical resolution to localized calculator sub-modules.
 */

import { GameDataLoader } from "./GameDataLoader.js";
import { DamageCalculator, EXTRA_ATTACK_POSITION, MIN_NP_LEVEL, MAX_NP_LEVEL, DEFAULT_NP_LEVEL } from "./DamageCalculator.js";
import { RefundCalculator, OVERKILL_MODIFIER, FIRST_CARD_ARTS_BONUS } from "./RefundCalculator.js";
import { StarGenCalculator, FIRST_CARD_QUICK_BONUS, STAR_GEN_OVERKILL_ADD, STAR_GEN_MAX_CHANCE } from "./StarGenCalculator.js";
import { ProbabilityCalculator } from "./ProbabilityCalculator.js";

export const DEFAULT_FOU_ATTACK = 1000;
const FIRST_CARD_BUSTER_BONUS = 0.5;
const BRAVE_CHAIN_CARD_REQUIREMENT = 3;
const RNG_MIN_MULTIPLIER = 0.9;
const RNG_AVG_MULTIPLIER = 1.0;
const RNG_MAX_MULTIPLIER = 1.099;
const BUSTER_CHAIN_MOD = 0.2;

export const ATK_DEF_CARDMOD_UPPER_BOUND = 400;
export const ATK_DEF_CARDMOD_LOWER_BOUND = -100;
export const POWERMOD_SPECIALATKMOD_UPPER_BOUND = 1000;
export const POWERMOD_SPECIALATKMOD_LOWER_BOUND = -100000;
export const CRITDMG_NPDMG_UPPER_BOUND = 500;
export const CRITDMG_NPDMG_LOWER_BOUND = -100000;
export const SPECIALDEFMOD_UPPER_BOUND = 500;
export const SPECIALDEFMOD_LOWER_BOUND = -100;

class CardLoopResult {
  constructor(initialHp) {
    this.hpForMinRoll = initialHp;
    this.hpForMaxRoll = initialHp;
    this.provisionalDamageCounterMinRoll = 0;
    this.provisionalDamageCounterMaxRoll = 0;
    this.damagingCardCount = 0;
    this.totalMinDamage = 0;
    this.totalAvgDamage = 0;
    this.totalMaxDamage = 0;
    this.totalRefundMinRoll = 0;
    this.totalRefundMaxRoll = 0;
    this.totalStarGenMinRollLowChance = 0;
    this.totalStarGenMinRollHighChance = 0;
    this.totalStarGenMaxRollLowChance = 0;
    this.totalStarGenMaxRollHighChance = 0;
    this.totalOverkillHitsMinRoll = 0;
    this.totalOverkillHitsMaxRoll = 0;
    this.avgCardDamages = [];
    this.perCardResults = [];
    this.successProbability = 0;
  }
  add(other) {
    this.damagingCardCount += other.damagingCardCount;
    this.totalMinDamage += other.totalMinDamage;
    this.totalAvgDamage += other.totalAvgDamage;
    this.totalMaxDamage += other.totalMaxDamage;
    this.totalRefundMinRoll += other.totalRefundMinRoll;
    this.totalRefundMaxRoll += other.totalRefundMaxRoll;
    this.totalStarGenMinRollLowChance += other.totalStarGenMinRollLowChance;
    this.totalStarGenMinRollHighChance += other.totalStarGenMinRollHighChance;
    this.totalStarGenMaxRollLowChance += other.totalStarGenMaxRollLowChance;
    this.totalStarGenMaxRollHighChance += other.totalStarGenMaxRollHighChance;
    this.totalOverkillHitsMinRoll += other.totalOverkillHitsMinRoll;
    this.totalOverkillHitsMaxRoll += other.totalOverkillHitsMaxRoll;
    this.avgCardDamages.push(...other.avgCardDamages);
    this.perCardResults.push(...other.perCardResults);
  }
}

function checkBuffCap(value, name, lowerBound, upperBound, warnings) {
  if (value > upperBound || value < lowerBound) {
    warnings.push(`Buff cap reached for: ${name}`);
  }
}

/**
 * Applies game-defined boundaries to a buff value unless specifically bypassed.
 * @param {number} value - The raw numerical value to constrain.
 * @param {number} min - The lower limit.
 * @param {number} max - The upper limit.
 * @param {boolean} nocap - Flag indicating whether to bypass constraint logic entirely.
 * @returns {number} Evaluated value.
 */
export function applyCap(value, min, max, nocap) {
  if (nocap) return value;
  return Math.max(min, Math.min(max, value));
}

export const CalculationEngine = {
  
  /**
   * Computes the entire outcome (damage, refund, stargen) for a given card chain.
   * @param {Object} servant - The active servant object.
   * @param {Object} buffs - Parsed active buffs applied to this specific evaluation.
   * @param {Object} globalBuffs - Global snapshot state.
   * @param {string} cardChain - String code representing the card sequence.
   * @returns {Object} A compound object containing the `loopResult` and `chainProps`.
   */
  calculateCardChainDamage(servant, buffs, globalBuffs, cardChain) {
    let effectiveChain = cardChain;
    let isFallback = false;
    let isExtraOnlyTest = false;

    if (!effectiveChain) {
      isFallback = true;
      effectiveChain = "np";
    }

    let cardTokenCount = 0;
    let k = 0;
    while (k < effectiveChain.length) {
      cardTokenCount++;
      k += k + 1 < effectiveChain.length && effectiveChain.startsWith("np", k) ? 2 : 1;
    }

    if (cardTokenCount === 1 && effectiveChain === "e") isExtraOnlyTest = true;

    let isSingleCardTest = false;
    let forcedPosition = 0;
    if (!isExtraOnlyTest && cardTokenCount === 1 && effectiveChain !== "e" && effectiveChain !== "x") {
      if (buffs.getFlag("second")) forcedPosition = 2;
      else if (buffs.getFlag("third")) forcedPosition = 3;
      isSingleCardTest = true;
    }

    const normalizedChain = effectiveChain.replace(/np/g, globalBuffs.npCardType.charAt(0).toLowerCase());
    let primaryCardCount = 0;
    for (const c of normalizedChain) {
      if (c !== "e" && c !== "x") primaryCardCount++;
    }

    if (!effectiveChain || (primaryCardCount === 0 && !isExtraOnlyTest && !isFallback)) {
      console.warn("Warning: No valid card chain found for this wave.");
      return {
        loopResult: new CardLoopResult(0),
        chainProps: {
          isBraveChain: false, isBraveChainMatch: false, isMightyChain: false, isBusterChain: false,
          firstCardBusterBonus: 0, firstCardArtsBonus: 0, firstCardQuickBonus: 0,
        },
      };
    }

    const chainProps = this.analyzeChain(
      effectiveChain, normalizedChain, globalBuffs.npCardType, buffs, primaryCardCount, isSingleCardTest, isExtraOnlyTest
    );

    let mainLoopResult = new CardLoopResult(globalBuffs.enemy.enemyHp);
    if (!isExtraOnlyTest) {
      mainLoopResult = this.processMainCardLoop(servant, buffs, globalBuffs, chainProps, effectiveChain, isSingleCardTest, forcedPosition);
    }

    let extraLoopResult = new CardLoopResult(mainLoopResult.hpForMaxRoll);
    extraLoopResult.hpForMinRoll = mainLoopResult.hpForMinRoll;
    extraLoopResult.provisionalDamageCounterMaxRoll = mainLoopResult.provisionalDamageCounterMaxRoll;
    extraLoopResult.provisionalDamageCounterMinRoll = mainLoopResult.provisionalDamageCounterMinRoll;

    if ((!isFallback && primaryCardCount >= BRAVE_CHAIN_CARD_REQUIREMENT) || isExtraOnlyTest) {
      extraLoopResult = this.processExtraAttack(servant, buffs, globalBuffs, chainProps, mainLoopResult);
    }

    let finalResult = new CardLoopResult(globalBuffs.enemy.enemyHp);
    finalResult.add(mainLoopResult);
    finalResult.add(extraLoopResult);

    finalResult.hpForMinRoll = extraLoopResult.hpForMinRoll;
    finalResult.hpForMaxRoll = extraLoopResult.hpForMaxRoll;
    finalResult.provisionalDamageCounterMinRoll = extraLoopResult.provisionalDamageCounterMinRoll;
    finalResult.provisionalDamageCounterMaxRoll = extraLoopResult.provisionalDamageCounterMaxRoll;

    let finalRefundAddRaw = Math.floor(globalBuffs.npGainMods.finalRefundAdd || 0);
    let finalRefundAddScaled = finalRefundAddRaw * 100;
    let finalStarAdd = Math.floor(globalBuffs.starGenMods.finalStarAdd || 0);

    finalResult.totalRefundMinRoll += finalRefundAddScaled;
    finalResult.totalRefundMaxRoll += finalRefundAddScaled;
    finalResult.totalStarGenMinRollLowChance += finalStarAdd;
    finalResult.totalStarGenMinRollHighChance += finalStarAdd;
    finalResult.totalStarGenMaxRollLowChance += finalStarAdd;
    finalResult.totalStarGenMaxRollHighChance += finalStarAdd;

    if (globalBuffs.enemy.enemyHp !== Number.MAX_SAFE_INTEGER && finalResult.damagingCardCount > 0) {
      finalResult.successProbability = ProbabilityCalculator.calculateSuccessProbability(
        finalResult.avgCardDamages,
        globalBuffs.enemy.enemyHp,
      );
    }

    return {loopResult: finalResult, chainProps};
  },

  /**
   * Distills external buffs, stats, and relations into a finalized, immutable mathematical snapshot.
   * @param {Object} servant - The base servant entity data.
   * @param {Object} buffs - The processed buff definitions.
   * @returns {Object} Contains the evaluated mathematical `snapshot` and its associated `capInfo`.
   */
  createBuffSnapshot(servant, buffs) {
    const attackOverride = buffs.getMod("ta");
    const classAdvantageOverride = buffs.getMod("cao");
    const attributeOverride = buffs.getMod("aao");
    const classAtkMultiplierOverride = buffs.getMod("cmo");
    const extraCardModOverride = buffs.getMod("ecm");

    const fouAttack = buffs.mods["f"] !== undefined ? buffs.getMod("f") : DEFAULT_FOU_ATTACK;
    let resolvedBaseAttack;

    if (attackOverride !== 0.0) {
      resolvedBaseAttack = attackOverride;
    } else {
      let baseAttackStat;
      let reqLevel = buffs.requestedLevel;
      let effectiveLevel = reqLevel <= 0 ? servant.levelDefault : reqLevel;

      if (effectiveLevel > 0) {
        let atkGrowth = servant.attackGrowth;
        if (atkGrowth && atkGrowth.length >= effectiveLevel) {
          baseAttackStat = atkGrowth[effectiveLevel - 1];
        } else {
          console.warn(`Invalid atkGrowth data for lv ${effectiveLevel}. Falling back to default max ATK.`);
          baseAttackStat = servant.attackMax || servant.attackStat;
        }
      } else {
        console.warn(`Invalid level ${effectiveLevel} requested. Falling back to default ATK.`);
        baseAttackStat = servant.attackStat;
      }
      resolvedBaseAttack = baseAttackStat + buffs.getMod("ce") + fouAttack;
    }

    const attributeRelations = GameDataLoader.ATTRIBUTE_RELATIONS[servant.attribute] || {};
    const attributeMultiplier = attributeOverride !== 0.0 ? attributeOverride : (attributeRelations[buffs.enemyAttribute] || 1000) / 1000.0;

    const classRelations = GameDataLoader.CLASS_RELATIONS[servant.classType] || {};
    const classAdvantageMultiplier = classAdvantageOverride !== 0.0 ? classAdvantageOverride : (classRelations[buffs.enemyClass] || 1000) / 1000.0;

    const classAtkMultiplier = classAtkMultiplierOverride !== 0.0 ? classAtkMultiplierOverride : (GameDataLoader.CLASS_ATTACK_MODIFIERS[servant.classType] || 1000) / 1000.0;

    const esmOverride = buffs.getMod("esm");
    const esrOverride = buffs.getMod("esr");
    const enemyMods = GameDataLoader.ENEMY_CLASS_MODS[buffs.enemyClass] || { attackRate: 1.0, starRate: 1.0 };
    const enemyServerMod = enemyMods.attackRate || 1.0;
    const enemyServerRate = enemyMods.starRate || 1.0;

    const finalEnemyServerMod = esmOverride !== 0.0 ? esmOverride : enemyServerMod;
    const finalEnemyServerRate = esrOverride !== 0.0 ? esrOverride * 100 : (enemyServerRate - 1.0) * 100.0;

    let warnings = [];
    let nocap = buffs.getFlag("nocap");

    if (!nocap) {
      checkBuffCap(buffs.getMod("a"), "ATK", ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, warnings);
      checkBuffCap(buffs.getMod("d"), "DEF", ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, warnings);
      checkBuffCap(buffs.getMod("am") + buffs.getMod("ap"), "Arts Mod", ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, warnings);
      checkBuffCap(buffs.getMod("bm") + buffs.getMod("bp"), "Buster Mod", ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, warnings);
      checkBuffCap(buffs.getMod("qm") + buffs.getMod("qp"), "Quick Mod", ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, warnings);
      checkBuffCap(buffs.getMod("cd") + buffs.getMod("acd") + buffs.getMod("bcd") + buffs.getMod("qcd"), "Crit Dmg", CRITDMG_NPDMG_LOWER_BOUND, CRITDMG_NPDMG_UPPER_BOUND, warnings);
      checkBuffCap(buffs.getMod("n"), "NP Dmg", CRITDMG_NPDMG_LOWER_BOUND, CRITDMG_NPDMG_UPPER_BOUND, warnings);
      checkBuffCap(buffs.getMod("p"), "Power Mod", POWERMOD_SPECIALATKMOD_LOWER_BOUND, POWERMOD_SPECIALATKMOD_UPPER_BOUND, warnings);
      checkBuffCap(buffs.getMod("sam"), "Special ATK", POWERMOD_SPECIALATKMOD_LOWER_BOUND, POWERMOD_SPECIALATKMOD_UPPER_BOUND, warnings);
      checkBuffCap(buffs.getMod("sdm"), "Special DEF", SPECIALDEFMOD_LOWER_BOUND, SPECIALDEFMOD_UPPER_BOUND, warnings);
      checkBuffCap(buffs.getMod("ng"), "NP Gain", ATK_DEF_CARDMOD_LOWER_BOUND, CRITDMG_NPDMG_UPPER_BOUND, warnings);
      checkBuffCap(buffs.getMod("sg"), "Star Gen", POWERMOD_SPECIALATKMOD_LOWER_BOUND, POWERMOD_SPECIALATKMOD_UPPER_BOUND, warnings);
    }

    let strKey = String(buffs.str !== 0 ? buffs.str : buffs.getMod("str") || 0);
    let finalStrKey = "0";

    if (strKey !== "0" && servant.npCardTypes[strKey]) finalStrKey = strKey;

    let overchargeLevel = buffs.overchargeLevel !== 1 ? buffs.overchargeLevel : buffs.getMod("oc") || 1;

    const npCardType = servant.npCardTypes[finalStrKey] || "arts";
    let npDamageStat = servant.npDamageStats[finalStrKey] || [0, 0, 0, 0, 0];
    let npDamageStatOC = servant.npDamageStatsOC[finalStrKey] || [];

    const damageMods = {
      attackMod: buffs.getMod("a"), defenceMod: buffs.getMod("d"), artsMod: buffs.getMod("am"), busterMod: buffs.getMod("bm"),
      quickMod: buffs.getMod("qm"), extraMod: buffs.getMod("em"), powerMod: buffs.getMod("p"), npDamageMod: buffs.getMod("n"),
      critDamageMod: buffs.getMod("cd"), specialDefenceMod: buffs.getMod("sdm"), specialAttackMod: buffs.getMod("sam"),
      superEffectiveMod: buffs.getMod("se"), npPowerBoost: buffs.getMod("npp"), artsPower: buffs.getMod("ap"),
      busterPower: buffs.getMod("bp"), quickPower: buffs.getMod("qp"), extraPower: buffs.getMod("ep"),
      artsCritDamageMod: buffs.getMod("acd"), busterCritDamageMod: buffs.getMod("bcd"), quickCritDamageMod: buffs.getMod("qcd"),
      flatDamage: buffs.getMod("fd"), npDamageOverride: buffs.getMod("np"), npLevelValue: buffs.getMod("npo"),
    };

    const npGainMods = {
      npGainMod: buffs.getMod("ng"), enemyServerMod: finalEnemyServerMod, finalRefundAdd: buffs.getMod("fr"),
      artsNpGainMod: buffs.getMod("ang"), busterNpGainMod: buffs.getMod("bng"), quickNpGainMod: buffs.getMod("qng"),
    };

    const starGenMods = {
      stargen: buffs.getMod("sg"), enemyServerRate: finalEnemyServerRate, finalStarAdd: buffs.getMod("fs"),
      artsStarGenMod: buffs.getMod("asg"), busterStarGenMod: buffs.getMod("bsg"), quickStarGenMod: buffs.getMod("qsg"),
    };

    const enemy = {
      enemyHp: buffs.enemyHp === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : buffs.enemyHp,
      enemyAttribute: buffs.enemyAttribute, enemyClass: buffs.enemyClass,
    };

    const advantages = { attributeMultiplier, classAdvantageMultiplier, classAtkMultiplier };

    const damageRate = buffs.mods["dr"] !== undefined ? buffs.getMod("dr") : -1.0;
    const npGainRate = buffs.mods["ngr"] !== undefined ? buffs.getMod("ngr") : -1.0;
    const starGenRate = buffs.mods["sgr"] !== undefined ? buffs.getMod("sgr") : -1.0;

    const snapshot = {
      damageMods, npGainMods, starGenMods, enemy, advantages, resolvedBaseAttack, fouPawAttack: buffs.getMod("fp"),
      attackOverride, extraCardModOverride, rngOverride: buffs.getMod("rng"), overkillFlag: buffs.getFlag("ok"),
      damageRate, npGainRate, starGenRate, npCardType, npRateCard: servant.npRateCard, npRateNP: servant.npRateNP,
      npHits: servant.npHits, npDamageStat, npDamageStatOC, overchargeLevel, npStrKey: finalStrKey,
    };

    return {snapshot, capInfo: {warnings, nocap}};
  },

  /**
   * Scans a sequence of cards to determine chain bonuses (Mighty, Brave, Buster).
   * @param {string} effectiveChain - Raw card sequence.
   * @param {string} normalizedChain - Sequence normalized to generic color keys.
   * @param {string} npCardType - The NP color for the servant.
   * @param {Object} buffs - Parsed active buffs.
   * @param {number} primaryCardCount - Quantity of non-extra cards.
   * @param {boolean} isSingleCardTest - Flag designating solitary evaluations.
   * @param {boolean} isExtraOnlyTest - Flag designating extra-only evaluations.
   * @returns {Object} Extracted chain properties.
   */
  analyzeChain(effectiveChain, normalizedChain, npCardType, buffs, primaryCardCount, isSingleCardTest, isExtraOnlyTest) {
    let isBraveChainMatch = false, isMightyChain = false, isBusterChain = false;
    let isBraveChain = primaryCardCount >= BRAVE_CHAIN_CARD_REQUIREMENT && !isSingleCardTest && !isExtraOnlyTest;

    if (isBraveChain) {
      const threePrimaryCards = normalizedChain.replace(/[xe]/g, "");
      if (threePrimaryCards.length >= BRAVE_CHAIN_CARD_REQUIREMENT) {
        const firstThree = threePrimaryCards.substring(0, BRAVE_CHAIN_CARD_REQUIREMENT);
        if (/^[a]{3}$/.test(firstThree)) isBraveChainMatch = true;
        else if (/^[q]{3}$/.test(firstThree)) isBraveChainMatch = true;
        else if (/^[b]{3}$/.test(firstThree)) { isBraveChainMatch = true; isBusterChain = true; }
      }
      if (normalizedChain.includes("a") && normalizedChain.includes("b") && normalizedChain.includes("q")) isMightyChain = true;
    }

    if (buffs.getFlag("bc") && !isBusterChain) isBusterChain = true;
    if (buffs.getFlag("mighty") && !isMightyChain) isMightyChain = true;

    const isFirstBuster = effectiveChain.startsWith("b") || (effectiveChain.startsWith("np") && npCardType === "buster");
    const firstCardBusterBonus = isMightyChain || buffs.getFlag("bf") || (isFirstBuster && !buffs.getFlag("nobf")) ? FIRST_CARD_BUSTER_BONUS : 0.0;

    const isFirstArts = effectiveChain.startsWith("a") || (effectiveChain.startsWith("np") && npCardType === "arts");
    const firstCardArtsBonus = isMightyChain || buffs.getFlag("af") || isFirstArts ? FIRST_CARD_ARTS_BONUS : 0.0;

    const isFirstQuick = effectiveChain.startsWith("q") || (effectiveChain.startsWith("np") && npCardType === "quick");
    const firstCardQuickBonus = isMightyChain || buffs.getFlag("qf") || isFirstQuick ? FIRST_CARD_QUICK_BONUS : 0.0;

    return {
      isBraveChain, isBraveChainMatch, isMightyChain, isBusterChain,
      firstCardBusterBonus, firstCardArtsBonus, firstCardQuickBonus,
    };
  },

  processMainCardLoop(servant, buffs, g, chainProps, effectiveChain, isSingleCardTest, forcedPosition) {
    let result = new CardLoopResult(g.enemy.enemyHp);
    let chainHasNp = effectiveChain.includes("np");
    let npCardEncountered = false;
    let chain = effectiveChain;
    let cardPositionInChain = 1;
    let i = 0;

    while (i < chain.length) {
      let currentCardToken = i + 1 < chain.length && chain.startsWith("np", i) ? "np" : chain.substring(i, i + 1);
      i += currentCardToken.length;

      if (currentCardToken === "np") npCardEncountered = true;
      if (currentCardToken === "x" || currentCardToken === "e") {
        if (!isSingleCardTest && currentCardToken !== "e") cardPositionInChain++;
        continue;
      }

      let actualPosition = isSingleCardTest ? forcedPosition > 0 ? forcedPosition : 1 : cardPositionInChain;

      const input = {
        servant, buffs, g, chainProps, currentCardToken, actualPosition,
        hpForMinRoll: result.hpForMinRoll, hpForMaxRoll: result.hpForMaxRoll,
        provisionalDamageCounterMinRoll: result.provisionalDamageCounterMinRoll,
        provisionalDamageCounterMaxRoll: result.provisionalDamageCounterMaxRoll,
        chainHasNp, npCardEncountered,
      };

      const cardResult = this.processOneCard(input);

      result.add(cardResult.loopResult);
      result.perCardResults.push(cardResult.perCardResult);

      result.hpForMinRoll = cardResult.finalHpMin;
      result.hpForMaxRoll = cardResult.finalHpMax;
      result.provisionalDamageCounterMinRoll = cardResult.finalProvDamageMin;
      result.provisionalDamageCounterMaxRoll = cardResult.finalProvDamageMax;

      if (isSingleCardTest) break;
      cardPositionInChain++;
    }
    return result;
  },

  getExpandedHitDistribution(servant, g, currentCardToken, hitMultiplier) {
    let hitDistKey = currentCardToken === "np" ? "np" + g.npCardType.charAt(0).toUpperCase() + g.npCardType.slice(1).toLowerCase() + g.npStrKey : currentCardToken;
    let originalDist = servant.hitDistributions[hitDistKey];
    let originalHits = 0;

    switch (currentCardToken) {
      case "a": originalHits = servant.artsHits; break;
      case "b": originalHits = servant.busterHits; break;
      case "q": originalHits = servant.quickHits; break;
      case "np": originalHits = g.npHits; break;
      case "e": originalHits = servant.extraHits; break;
    }

    if (!originalDist || originalHits !== originalDist.length) {
      console.warn(`Hit distribution missing or mismatched for card type: ${hitDistKey}`);
      originalDist = [];
      if (originalHits > 0) {
        for (let i = 0; i < originalHits; i++) originalDist.push(1.0 / originalHits);
      }
      originalHits = originalDist.length;
    }

    if (hitMultiplier > 1 && originalHits > 0) {
      let expandedDist = new Array(originalHits * hitMultiplier);
      for (let i = 0; i < originalHits; i++) {
        for (let m = 0; m < hitMultiplier; m++) {
          expandedDist[i * hitMultiplier + m] = originalDist[i];
        }
      }
      return expandedDist;
    }
    return originalDist;
  },

  processOneCard(input) {
    const {servant, buffs, g, chainProps, currentCardToken, actualPosition} = input;

    let result = new CardLoopResult(0);
    result.damagingCardCount++;

    let rngMin = g.rngOverride !== 0.0 ? g.rngOverride : RNG_MIN_MULTIPLIER;
    let rngAvg = g.rngOverride !== 0.0 ? g.rngOverride : RNG_AVG_MULTIPLIER;
    let rngMax = g.rngOverride !== 0.0 ? g.rngOverride : RNG_MAX_MULTIPLIER;

    let localMods = buffs.cardMods[actualPosition] || {};
    let localFlags = buffs.cardFlags[actualPosition] || {};
    let isCrit = (buffs.getFlag("crit") || localFlags["crit"]) && currentCardToken !== "np";

    // --- Resolve Rates Hierarchy ---
    let effectiveCardType = currentCardToken === "np" ? "np" : currentCardToken;
    let servantRates = servant.aoeRates[effectiveCardType] || [100.0, 100.0, 100.0];
    let resolvedDr = localMods["dr"] !== undefined ? localMods["dr"] : (g.damageRate !== -1.0 ? g.damageRate : servantRates[0]);
    let resolvedNgr = localMods["ngr"] !== undefined ? localMods["ngr"] : (g.npGainRate !== -1.0 ? g.npGainRate : servantRates[1]);
    let resolvedSgr = localMods["sgr"] !== undefined ? localMods["sgr"] : (g.starGenRate !== -1.0 ? g.starGenRate : servantRates[2]);

    let hitMultiplier = Math.max(1, Math.floor(buffs.getMod("ff") + (localMods["ff"] || 0.0)));
    let hitDistribution = this.getExpandedHitDistribution(servant, g, currentCardToken, hitMultiplier);
    let numHits = hitDistribution.length;

    let cardDamage = DamageCalculator.calculateSingleCardDamage(
      servant, buffs, g, currentCardToken, actualPosition, chainProps.firstCardBusterBonus, resolvedDr
    );
    let totalFlatDamageForThisCard = g.damageMods.flatDamage + (localMods["fd"] || 0.0);

    if (chainProps.isBusterChain && currentCardToken === "b") {
      let currentFouPaw = currentCardToken === "np" ? 0 : g.fouPawAttack + (localMods["fp"] || 0.0);
      totalFlatDamageForThisCard += (g.resolvedBaseAttack + currentFouPaw) * BUSTER_CHAIN_MOD;
    }

    let hpForMinRoll = input.hpForMinRoll;
    let hpForMaxRoll = input.hpForMaxRoll;

    let provisionalDamageCounterMinRoll = 0;
    let provisionalDamageCounterMaxRoll = 0;

    if (localMods["reducedhp"] !== undefined) {
      provisionalDamageCounterMaxRoll = localMods["reducedhp"];
      provisionalDamageCounterMinRoll = localMods["reducedhp"];
    } else if (buffs.mods["reducedhp"] !== undefined) {
      provisionalDamageCounterMaxRoll = buffs.getMod("reducedhp");
      provisionalDamageCounterMinRoll = buffs.getMod("reducedhp");
    } else {
      provisionalDamageCounterMinRoll = input.provisionalDamageCounterMinRoll;
      provisionalDamageCounterMaxRoll = input.provisionalDamageCounterMaxRoll;
    }

    let isNonDamagingNP = false;
    if (currentCardToken === "np") {
      let npLevel = Math.floor(g.damageMods.npLevelValue || DEFAULT_NP_LEVEL);
      if (npLevel <= 0 || npLevel > MAX_NP_LEVEL) npLevel = DEFAULT_NP_LEVEL;
      let npDamageOverride = g.damageMods.npDamageOverride;
      let npDamageMod = g.npDamageStat && g.npDamageStat.length >= npLevel ? g.npDamageStat[npLevel - 1] : 0.0;
      isNonDamagingNP = npDamageOverride === 0.0 && npDamageMod === 0.0;
    }

    let hitGain_no_floor = RefundCalculator.calculateSingleHitRefund(
      buffs, g, localMods, currentCardToken, actualPosition, chainProps.firstCardArtsBonus, isCrit, resolvedNgr
    );
    let base_gain = Math.floor(hitGain_no_floor);
    let overkill_gain = Math.floor(base_gain * OVERKILL_MODIFIER);

    let firstCardBonus = currentCardToken === "np" ? 0.0 : chainProps.firstCardQuickBonus;
    let baseStarChance = StarGenCalculator.getBaseStarChance(
      servant, g, localMods, currentCardToken, actualPosition, firstCardBonus, isCrit, isNonDamagingNP, resolvedSgr
    );

    let totalCardDamageMin = Math.max(cardDamage * rngMin + totalFlatDamageForThisCard, 0.0);
    let totalCardDamageMax = Math.max(cardDamage * rngMax + totalFlatDamageForThisCard, 0.0);

    let cardRefundMin = 0, cardRefundMax = 0;
    let cardStarGenMinLowChance = 0, cardStarGenMaxLowChance = 0, cardStarGenMinHighChance = 0, cardStarGenMaxHighChance = 0;
    let cardOverkillHitsMinRoll = 0, cardOverkillHitsMaxRoll = 0;
    let accumulatedDamageMin = 0, accumulatedDamageMax = 0;

    for (let h = 0; h < numHits; h++) {
      let rawPercentage = numHits > 0 ? hitDistribution[h] : 0.0;
      let effectiveScale = hitMultiplier > 1 ? rawPercentage / hitMultiplier : rawPercentage;

      let hitDamageSimMin, hitDamageSimMax;

      if (h === numHits - 1) {
        hitDamageSimMin = Math.max(0, totalCardDamageMin - accumulatedDamageMin);
        hitDamageSimMax = Math.max(0, totalCardDamageMax - accumulatedDamageMax);
      } else {
        hitDamageSimMin = Math.floor(totalCardDamageMin * effectiveScale);
        hitDamageSimMax = Math.floor(totalCardDamageMax * effectiveScale);
      }

      accumulatedDamageMin += hitDamageSimMin;
      accumulatedDamageMax += hitDamageSimMax;

      provisionalDamageCounterMinRoll += hitDamageSimMin;
      provisionalDamageCounterMaxRoll += hitDamageSimMax;

      let applyOverkillMinRoll = hpForMinRoll <= 0 || provisionalDamageCounterMinRoll >= input.hpForMinRoll || g.overkillFlag;
      let applyOverkillMaxRoll = hpForMaxRoll <= 0 || provisionalDamageCounterMaxRoll >= input.hpForMaxRoll || g.overkillFlag;

      if (g.enemy.enemyHp !== Number.MAX_SAFE_INTEGER) {
        hpForMinRoll -= hitDamageSimMin;
        hpForMaxRoll -= hitDamageSimMax;
      }

      cardRefundMin += applyOverkillMinRoll ? overkill_gain : base_gain;
      if (applyOverkillMinRoll) {
        result.totalOverkillHitsMinRoll++;
        cardOverkillHitsMinRoll++;
      }
      cardRefundMax += applyOverkillMaxRoll ? overkill_gain : base_gain;
      if (applyOverkillMaxRoll) {
        result.totalOverkillHitsMaxRoll++;
        cardOverkillHitsMaxRoll++;
      }

      if (!isNonDamagingNP) {
        let overkillAddMinRoll = applyOverkillMinRoll ? STAR_GEN_OVERKILL_ADD : 0.0;
        let overkillAddMaxRoll = applyOverkillMaxRoll ? STAR_GEN_OVERKILL_ADD : 0.0;
        cardStarGenMinLowChance += Math.floor(Math.min(baseStarChance + overkillAddMinRoll, STAR_GEN_MAX_CHANCE) / 100);
        cardStarGenMinHighChance += Math.ceil(Math.min(baseStarChance + overkillAddMinRoll, STAR_GEN_MAX_CHANCE) / 100);
        cardStarGenMaxLowChance += Math.floor(Math.min(baseStarChance + overkillAddMaxRoll, STAR_GEN_MAX_CHANCE) / 100);
        cardStarGenMaxHighChance += Math.ceil(Math.min(baseStarChance + overkillAddMaxRoll, STAR_GEN_MAX_CHANCE) / 100);
      }
    }

    let damageRGN1 = Math.floor(Math.max(cardDamage * rngMin + totalFlatDamageForThisCard, 0));
    let damageRGN2 = Math.floor(Math.max(cardDamage * rngAvg + totalFlatDamageForThisCard, 0));
    let damageRGN3 = Math.floor(Math.max(cardDamage * rngMax + totalFlatDamageForThisCard, 0));

    result.totalMinDamage += damageRGN1;
    result.totalAvgDamage += damageRGN2;
    result.totalMaxDamage += damageRGN3;
    result.avgCardDamages.push(damageRGN2);

    let comparisonHpMinRoll = hpForMinRoll;
    let comparisonHpMaxRoll = hpForMaxRoll;

    let ocLevel = g.overchargeLevel;
    let npDamageStatOC = g.npDamageStatOC;
    let ocDamageTotalMin = 0, ocDamageTotalAvg = 0, ocDamageTotalMax = 0;

    let ocMechanic = servant.ocMechanicType || "standard";
    let ocDataExists = npDamageStatOC && npDamageStatOC.length >= ocLevel;
    let triggerArashMultihit = currentCardToken === "np" && ocMechanic === "arash_multihit" && ocDataExists;
    let triggerBhimaMultihit = currentCardToken === "np" && ocMechanic === "bhima_multihit" && ocDataExists && ocLevel >= 2;

    if (triggerArashMultihit || triggerBhimaMultihit) {
      let ocCardDamageMultiplier = npDamageStatOC[ocLevel - 1] / 100.0;
      if (g.npCardType === "buster") ocCardDamageMultiplier *= 1.5;
      else if (g.npCardType === "quick") ocCardDamageMultiplier *= 0.8;

      let d = g.damageMods;
      let totalAttackMod = applyCap(d.attackMod + (localMods["a"] || 0.0), ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, buffs.getFlag("nocap"));
      let totalDefenceMod = applyCap(d.defenceMod + (localMods["d"] || 0.0), ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, buffs.getFlag("nocap"));
      let totalPowerMod = applyCap(d.powerMod + (localMods["p"] || 0.0), POWERMOD_SPECIALATKMOD_LOWER_BOUND, POWERMOD_SPECIALATKMOD_UPPER_BOUND, buffs.getFlag("nocap"));
      let totalSpecialAttackMod = applyCap(d.specialAttackMod + (localMods["sam"] || 0.0), POWERMOD_SPECIALATKMOD_LOWER_BOUND, POWERMOD_SPECIALATKMOD_UPPER_BOUND, buffs.getFlag("nocap"));
      let totalSpecialDefenceMod = applyCap(d.specialDefenceMod + (localMods["sdm"] || 0.0), SPECIALDEFMOD_LOWER_BOUND, SPECIALDEFMOD_UPPER_BOUND, buffs.getFlag("nocap"));
      let totalNpDamageMod = applyCap(d.npDamageMod + (localMods["n"] || 0.0), CRITDMG_NPDMG_LOWER_BOUND, CRITDMG_NPDMG_UPPER_BOUND, buffs.getFlag("nocap"));
      
      let cardColorModTotal = 0.0;
      if (g.npCardType === "arts") cardColorModTotal = d.artsMod + (localMods["am"] || 0.0) + d.artsPower + (localMods["ap"] || 0.0);
      else if (g.npCardType === "buster") cardColorModTotal = d.busterMod + (localMods["bm"] || 0.0) + d.busterPower + (localMods["bp"] || 0.0);
      else if (g.npCardType === "quick") cardColorModTotal = d.quickMod + (localMods["qm"] || 0.0) + d.quickPower + (localMods["qp"] || 0.0);
      cardColorModTotal = applyCap(cardColorModTotal, ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, buffs.getFlag("nocap"));

      let npModTotal = applyCap(totalNpDamageMod * (1.0 + d.npPowerBoost / 100.0), CRITDMG_NPDMG_LOWER_BOUND, CRITDMG_NPDMG_UPPER_BOUND, buffs.getFlag("nocap"));

      let baseDamage = g.resolvedBaseAttack * 0.23 * g.advantages.classAtkMultiplier;
      let totalAttackDefenseStack = Math.max(1.0 + (totalAttackMod - totalDefenceMod) / 100.0, 0.0);
      let totalCardColorStack = ocCardDamageMultiplier * 1.0 * Math.max(1.0 + cardColorModTotal / 100.0, 0.0);
      let totalPowerNPStack = Math.max(1.0 + totalPowerMod / 100.0 + npModTotal / 100.0, 0.001);
      let totalSpecialDefenseModCalc = Math.max(1.0 - totalSpecialDefenceMod / 100.0, 0.0);
      let totalSAM = Math.max(1.0 + totalSpecialAttackMod / 100.0, 0.001);

      let ocBaseDamage = baseDamage * totalAttackDefenseStack * totalCardColorStack * totalPowerNPStack * totalSpecialDefenseModCalc * totalSAM * 1.0 * g.advantages.attributeMultiplier * g.advantages.classAdvantageMultiplier;

      let enemyAliveMinRoll = comparisonHpMinRoll > 0;
      if (triggerBhimaMultihit || (triggerArashMultihit && enemyAliveMinRoll)) {
        let ocProvisionalDamage = 0;
        for (let h = 0; h < numHits; h++) {
          let hitPercentage = numHits > 0 ? hitDistribution[h] : 0.0;
          let effectiveScale = hitMultiplier > 1 ? hitPercentage / hitMultiplier : hitPercentage;

          let ocDamageRGN1_hit = Math.max((ocBaseDamage * rngMin + totalFlatDamageForThisCard) * effectiveScale, 0.0);
          ocDamageTotalMin += ocDamageRGN1_hit;
          ocProvisionalDamage += ocDamageRGN1_hit;
          if (g.enemy.enemyHp !== Number.MAX_SAFE_INTEGER) hpForMinRoll -= ocDamageRGN1_hit;
          let applyOverkillMinRoll = hpForMinRoll <= 0 || ocProvisionalDamage >= comparisonHpMinRoll || g.overkillFlag;
          cardRefundMin += applyOverkillMinRoll ? overkill_gain : base_gain;
          if (applyOverkillMinRoll) { cardOverkillHitsMinRoll++; result.totalOverkillHitsMinRoll++; }
          if (!isNonDamagingNP) {
            let overkillAddMinRoll = applyOverkillMinRoll ? STAR_GEN_OVERKILL_ADD : 0.0;
            cardStarGenMinLowChance += Math.floor(Math.min(baseStarChance + overkillAddMinRoll, STAR_GEN_MAX_CHANCE) / 100);
            cardStarGenMinHighChance += Math.ceil(Math.min(baseStarChance + overkillAddMinRoll, STAR_GEN_MAX_CHANCE) / 100);
          }
        }
      }

      let enemyAliveMaxRoll = comparisonHpMaxRoll > 0;
      if (triggerBhimaMultihit || (triggerArashMultihit && enemyAliveMaxRoll)) {
        let ocProvisionalDamage = 0;
        for (let h = 0; h < numHits; h++) {
          let hitPercentage = numHits > 0 ? hitDistribution[h] : 0.0;
          let effectiveScale = hitMultiplier > 1 ? hitPercentage / hitMultiplier : hitPercentage;

          let ocDamageRGN3_hit = Math.max((ocBaseDamage * rngMax + totalFlatDamageForThisCard) * effectiveScale, 0.0);
          ocDamageTotalMax += ocDamageRGN3_hit;
          ocProvisionalDamage += ocDamageRGN3_hit;
          if (g.enemy.enemyHp !== Number.MAX_SAFE_INTEGER) hpForMaxRoll -= ocDamageRGN3_hit;
          let applyOverkillMaxRoll = hpForMaxRoll <= 0 || ocProvisionalDamage >= comparisonHpMaxRoll || g.overkillFlag;
          cardRefundMax += applyOverkillMaxRoll ? overkill_gain : base_gain;
          if (applyOverkillMaxRoll) { cardOverkillHitsMaxRoll++; result.totalOverkillHitsMaxRoll++; }
          if (!isNonDamagingNP) {
            let overkillAddMaxRoll = applyOverkillMaxRoll ? STAR_GEN_OVERKILL_ADD : 0.0;
            cardStarGenMaxLowChance += Math.floor(Math.min(baseStarChance + overkillAddMaxRoll, STAR_GEN_MAX_CHANCE) / 100);
            cardStarGenMaxHighChance += Math.ceil(Math.min(baseStarChance + overkillAddMaxRoll, STAR_GEN_MAX_CHANCE) / 100);
          }
        }
      }

      if (triggerBhimaMultihit || (triggerArashMultihit && comparisonHpMinRoll > 0)) {
        for (let h = 0; h < numHits; h++) {
          let hitPercentage = numHits > 0 ? hitDistribution[h] : 0.0;
          let effectiveScale = hitMultiplier > 1 ? hitPercentage / hitMultiplier : hitPercentage;
          ocDamageTotalAvg += Math.max((ocBaseDamage * rngAvg + totalFlatDamageForThisCard) * effectiveScale, 0);
        }
      }

      result.totalMinDamage += Math.floor(ocDamageTotalMin);
      result.totalAvgDamage += Math.floor(ocDamageTotalAvg);
      result.totalMaxDamage += Math.floor(ocDamageTotalMax);
      if (ocDamageTotalAvg > 0) result.avgCardDamages.push(Math.floor(ocDamageTotalAvg));
    }

    let localFlatRefundRaw = localMods["fr"] || 0.0;
    let localFlatRefundScaled = Math.floor(localFlatRefundRaw * 100);
    let localFlatStars = Math.floor(localMods["fs"] || 0.0);

    cardRefundMin += localFlatRefundScaled;
    cardRefundMax += localFlatRefundScaled;
    cardStarGenMinLowChance += localFlatStars;
    cardStarGenMinHighChance += localFlatStars;
    cardStarGenMaxLowChance += localFlatStars;
    cardStarGenMaxHighChance += localFlatStars;

    if (!input.chainHasNp || input.npCardEncountered) {
      result.totalRefundMinRoll += cardRefundMin;
      result.totalRefundMaxRoll += cardRefundMax;
    }

    result.totalStarGenMinRollLowChance += cardStarGenMinLowChance;
    result.totalStarGenMinRollHighChance += cardStarGenMinHighChance;
    result.totalStarGenMaxRollLowChance += cardStarGenMaxLowChance;
    result.totalStarGenMaxRollHighChance += cardStarGenMaxHighChance;

    let perCardResult = {
      cardToken: currentCardToken.toUpperCase(),
      position: actualPosition,
      isCrit: isCrit,
      minDamage: damageRGN1 + Math.floor(ocDamageTotalMin),
      avgDamage: damageRGN2 + Math.floor(ocDamageTotalAvg),
      maxDamage: damageRGN3 + Math.floor(ocDamageTotalMax),
      npGainMinRoll: (cardRefundMin - localFlatRefundScaled) / 100.0,
      npGainMaxRoll: (cardRefundMax - localFlatRefundScaled) / 100.0,
      cardOverkillHitsMinRoll,
      cardOverkillHitsMaxRoll,
      starGenMinLowChance: cardStarGenMinLowChance - localFlatStars,
      starGenMinHighChance: cardStarGenMinHighChance - localFlatStars,
      starGenMaxLowChance: cardStarGenMaxLowChance - localFlatStars,
      starGenMaxHighChance: cardStarGenMaxHighChance - localFlatStars,
    };

    return {
      loopResult: result, perCardResult, finalHpMin: hpForMinRoll, finalHpMax: hpForMaxRoll,
      finalProvDamageMin: provisionalDamageCounterMinRoll, finalProvDamageMax: provisionalDamageCounterMaxRoll,
    };
  },

  processExtraAttack(servant, buffs, g, chainProps, priorResult) {
    let result = new CardLoopResult(priorResult.hpForMaxRoll);
    result.hpForMinRoll = priorResult.hpForMinRoll;
    result.provisionalDamageCounterMaxRoll = priorResult.provisionalDamageCounterMaxRoll;
    result.provisionalDamageCounterMinRoll = priorResult.provisionalDamageCounterMinRoll;
    result.damagingCardCount++;

    let rngMin = g.rngOverride !== 0.0 ? g.rngOverride : RNG_MIN_MULTIPLIER;
    let rngAvg = g.rngOverride !== 0.0 ? g.rngOverride : RNG_AVG_MULTIPLIER;
    let rngMax = g.rngOverride !== 0.0 ? g.rngOverride : RNG_MAX_MULTIPLIER;

    let localMods = buffs.cardMods[EXTRA_ATTACK_POSITION] || {};

    let servantRates = servant.aoeRates["e"] || [100.0, 100.0, 100.0];
    let resolvedDr = localMods["dr"] !== undefined ? localMods["dr"] : (g.damageRate !== -1.0 ? g.damageRate : servantRates[0]);
    let resolvedNgr = localMods["ngr"] !== undefined ? localMods["ngr"] : (g.npGainRate !== -1.0 ? g.npGainRate : servantRates[1]);
    let resolvedSgr = localMods["sgr"] !== undefined ? localMods["sgr"] : (g.starGenRate !== -1.0 ? g.starGenRate : servantRates[2]);

    let extraDamage = DamageCalculator.calculateExtraAttackDamage(
      servant, buffs, g, chainProps.isBraveChainMatch, chainProps.firstCardBusterBonus, resolvedDr
    );

    let hitMultiplier = Math.max(1, Math.floor(buffs.getMod("ff") + (localMods["ff"] || 0.0)));
    let hitDistribution = this.getExpandedHitDistribution(servant, g, "e", hitMultiplier);
    let numHits = hitDistribution.length;

    let totalFlatDamage = g.damageMods.flatDamage + (localMods["fd"] || 0.0);
    let comparisonHpMaxRoll = result.hpForMaxRoll, comparisonHpMinRoll = result.hpForMinRoll;

    let hitGain_no_floor = RefundCalculator.calculateExtraHitRefund(buffs, g, localMods, false, chainProps.firstCardArtsBonus, resolvedNgr);
    let base_gain = Math.floor(hitGain_no_floor);
    let overkill_gain = Math.floor(base_gain * OVERKILL_MODIFIER);

    let extraBaseStarChance = StarGenCalculator.getBaseStarChance(servant, g, localMods, "e", EXTRA_ATTACK_POSITION, chainProps.firstCardQuickBonus, false, false, resolvedSgr);

    let totalCardDamageMin = Math.max(extraDamage * rngMin + totalFlatDamage, 0.0);
    let totalCardDamageMax = Math.max(extraDamage * rngMax + totalFlatDamage, 0.0);

    let extraRefundMin = 0, extraRefundMax = 0;
    let extraStarGenMinLowChance = 0, extraStarGenMaxLowChance = 0;
    let extraStarGenMinHighChance = 0, extraStarGenMaxHighChance = 0;
    let cardOverkillHitsMinRoll = 0, cardOverkillHitsMaxRoll = 0;
    let accumulatedDamageMin = 0, accumulatedDamageMax = 0;

    for (let h = 0; h < numHits; h++) {
      let rawPercentage = numHits > 0 ? hitDistribution[h] : 0.0;
      let effectiveScale = hitMultiplier > 1 ? rawPercentage / hitMultiplier : rawPercentage;

      let hitDamageSimMin, hitDamageSimMax;

      if (h === numHits - 1) {
        hitDamageSimMin = Math.max(0, totalCardDamageMin - accumulatedDamageMin);
        hitDamageSimMax = Math.max(0, totalCardDamageMax - accumulatedDamageMax);
      } else {
        hitDamageSimMin = Math.floor(totalCardDamageMin * effectiveScale);
        hitDamageSimMax = Math.floor(totalCardDamageMax * effectiveScale);
      }

      accumulatedDamageMin += hitDamageSimMin;
      accumulatedDamageMax += hitDamageSimMax;

      result.provisionalDamageCounterMinRoll += hitDamageSimMin;
      result.provisionalDamageCounterMaxRoll += hitDamageSimMax;

      let applyOverkillMinRoll = result.hpForMinRoll <= 0 || result.provisionalDamageCounterMinRoll >= comparisonHpMinRoll || g.overkillFlag;
      let applyOverkillMaxRoll = result.hpForMaxRoll <= 0 || result.provisionalDamageCounterMaxRoll >= comparisonHpMaxRoll || g.overkillFlag;

      if (g.enemy.enemyHp !== Number.MAX_SAFE_INTEGER) {
        result.hpForMinRoll -= hitDamageSimMin;
        result.hpForMaxRoll -= hitDamageSimMax;
      }

      extraRefundMin += applyOverkillMinRoll ? overkill_gain : base_gain;
      if (applyOverkillMinRoll) {
        result.totalOverkillHitsMinRoll++;
        cardOverkillHitsMinRoll++;
      }
      extraRefundMax += applyOverkillMaxRoll ? overkill_gain : base_gain;
      if (applyOverkillMaxRoll) {
        result.totalOverkillHitsMaxRoll++;
        cardOverkillHitsMaxRoll++;
      }

      let overkillAddMinRoll = applyOverkillMinRoll ? STAR_GEN_OVERKILL_ADD : 0.0;
      let overkillAddMaxRoll = applyOverkillMaxRoll ? STAR_GEN_OVERKILL_ADD : 0.0;

      extraStarGenMinLowChance += Math.floor(Math.min(extraBaseStarChance + overkillAddMinRoll, STAR_GEN_MAX_CHANCE) / 100);
      extraStarGenMinHighChance += Math.ceil(Math.min(extraBaseStarChance + overkillAddMinRoll, STAR_GEN_MAX_CHANCE) / 100);
      extraStarGenMaxLowChance += Math.floor(Math.min(extraBaseStarChance + overkillAddMaxRoll, STAR_GEN_MAX_CHANCE) / 100);
      extraStarGenMaxHighChance += Math.ceil(Math.min(extraBaseStarChance + overkillAddMaxRoll, STAR_GEN_MAX_CHANCE) / 100);
    }

    let localFlatRefundRaw = localMods["fr"] || 0.0;
    let localFlatRefundScaled = Math.floor(localFlatRefundRaw * 100);
    let localFlatStars = Math.floor(localMods["fs"] || 0.0);

    extraRefundMin += localFlatRefundScaled;
    extraRefundMax += localFlatRefundScaled;
    extraStarGenMinLowChance += localFlatStars;
    extraStarGenMaxLowChance += localFlatStars;

    result.totalRefundMinRoll += extraRefundMin;
    result.totalRefundMaxRoll += extraRefundMax;
    result.totalStarGenMinRollLowChance += extraStarGenMinLowChance;
    result.totalStarGenMinRollHighChance += extraStarGenMinHighChance;
    result.totalStarGenMaxRollLowChance += extraStarGenMaxLowChance;
    result.totalStarGenMaxRollHighChance += extraStarGenMaxHighChance;

    let damageRGN1 = Math.floor(Math.max(extraDamage * rngMin + totalFlatDamage, 0));
    let damageRGN2 = Math.floor(Math.max(extraDamage * rngAvg + totalFlatDamage, 0));
    let damageRGN3 = Math.floor(Math.max(extraDamage * rngMax + totalFlatDamage, 0));

    result.perCardResults.push({
      cardToken: "EXTRA",
      position: EXTRA_ATTACK_POSITION,
      isCrit: false,
      minDamage: damageRGN1,
      avgDamage: damageRGN2,
      maxDamage: damageRGN3,
      npGainMinRoll: (extraRefundMin - localFlatRefundScaled) / 100.0,
      npGainMaxRoll: (extraRefundMax - localFlatRefundScaled) / 100.0,
      cardOverkillHitsMinRoll,
      cardOverkillHitsMaxRoll,
      starGenMinLowChance: extraStarGenMinLowChance - localFlatStars,
      starGenMinHighChance: extraStarGenMinHighChance - localFlatStars,
      starGenMaxLowChance: extraStarGenMaxLowChance - localFlatStars,
      starGenMaxHighChance: extraStarGenMaxHighChance - localFlatStars,
    });

    result.totalMinDamage += damageRGN1;
    result.totalAvgDamage += damageRGN2;
    result.totalMaxDamage += damageRGN3;
    result.avgCardDamages.push(damageRGN2);

    return result;
  }
};