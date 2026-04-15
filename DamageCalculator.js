/**
 * @file DamageCalculator.js
 * @description Decoupled module strictly handling damage formulas and buff cap applications.
 */

import {
  applyCap,
  ATK_DEF_CARDMOD_LOWER_BOUND,
  ATK_DEF_CARDMOD_UPPER_BOUND,
  POWERMOD_SPECIALATKMOD_LOWER_BOUND,
  POWERMOD_SPECIALATKMOD_UPPER_BOUND,
  CRITDMG_NPDMG_LOWER_BOUND,
  CRITDMG_NPDMG_UPPER_BOUND,
  SPECIALDEFMOD_LOWER_BOUND,
  SPECIALDEFMOD_UPPER_BOUND
} from "./CalculationEngine.js";

const BASE_DAMAGE_MULTIPLIER = 0.23;
const BUSTER_CARD_MULTIPLIER = 1.5;
const QUICK_CARD_MULTIPLIER = 0.8;
const ARTS_CARD_MULTIPLIER = 1.0;
const POSITION_MULTIPLIERS = [0.0, 1.0, 1.2, 1.4];
const BASE_CRIT_DAMAGE_FACTOR = 2.0;
const EXTRA_ATTACK_MULTIPLIER = 2.0;
const BRAVE_CHAIN_EXTRA_MULTIPLIER = 3.5;
export const EXTRA_ATTACK_POSITION = 4;
export const MIN_NP_LEVEL = 1;
export const MAX_NP_LEVEL = 5;
export const DEFAULT_NP_LEVEL = 5;
const MIN_STACK_VALUE = 0.0;
const MIN_POWER_STACK_VALUE = 0.001;

export const DamageCalculator = {
  /**
   * Evaluates the theoretical maximum damage for a single non-extra card strike.
   * @param {Object} servant - The active servant object.
   * @param {Object} buffs - Current active buffs.
   * @param {Object} g - Evaluated global parameters.
   * @param {string} currentCardToken - Identifying card type ("a", "b", "q", "np").
   * @param {number} actualPosition - Ordered location of this strike in the chain.
   * @param {number} firstCardBonus - Retained bonus modifiers.
   * @param {number} resolvedDr - The resolved Damage Rate modifier (e.g., 50 for half damage).
   * @returns {number} Pure theoretical card damage prior to RNG multipliers.
   */
  calculateSingleCardDamage(servant, buffs, g, currentCardToken, actualPosition, firstCardBonus, resolvedDr) {
    let localMods = buffs.cardMods[actualPosition] || {};
    let localFlags = buffs.cardFlags[actualPosition] || {};

    let isNp = currentCardToken === "np";
    let isCrit = (buffs.getFlag("crit") || localFlags["crit"]) && !isNp;

    let currentFouPawAttack = isNp ? 0 : g.fouPawAttack + (localMods["fp"] || 0.0);
    let effectiveFirstCardBonus = isNp ? 0.0 : firstCardBonus;
    let positionMultiplier = isNp ? 1.0 : actualPosition >= 1 && actualPosition <= 3 ? POSITION_MULTIPLIERS[actualPosition] : 1.0;

    let cardDamageMultiplier;
    if (isNp) {
      let d = g.damageMods;
      if (d.npDamageOverride !== 0.0) {
        cardDamageMultiplier = d.npDamageOverride / 100.0;
      } else {
        let npLevel = Math.floor(d.npLevelValue || DEFAULT_NP_LEVEL);
        if (npLevel <= 0 || npLevel > MAX_NP_LEVEL) npLevel = DEFAULT_NP_LEVEL;
        let npMod = g.npDamageStat && g.npDamageStat.length >= npLevel ? g.npDamageStat[npLevel - 1] : 0.0;
        cardDamageMultiplier = npMod / 100.0;
      }
      if (g.npCardType === "buster") cardDamageMultiplier *= BUSTER_CARD_MULTIPLIER;
      else if (g.npCardType === "quick") cardDamageMultiplier *= QUICK_CARD_MULTIPLIER;
    } else {
      switch (currentCardToken) {
        case "a": cardDamageMultiplier = ARTS_CARD_MULTIPLIER; break;
        case "b": cardDamageMultiplier = BUSTER_CARD_MULTIPLIER; break;
        case "q": cardDamageMultiplier = QUICK_CARD_MULTIPLIER; break;
        default: console.warn(`Unknown card token encountered: ${currentCardToken}`); return 0.0;
      }
    }

    return this.applyCapsAndGetFinalDamage(
      g.damageMods, localMods, buffs.getFlag("nocap"), g, effectiveFirstCardBonus, cardDamageMultiplier, positionMultiplier, currentFouPawAttack, isCrit, currentCardToken, resolvedDr
    );
  },

  /**
   * Applies FGO's internal hard caps to damage stacks before resolving the final calculation.
   * @returns {number} Evaluated damage.
   */
  applyCapsAndGetFinalDamage(d, localMods, nocap, g, firstCardBonus, cardDamageMultiplier, positionMultiplier, currentFouPawAttack, isCrit, cardType, resolvedDr) {
    let totalAttackMod = applyCap(d.attackMod + (localMods["a"] || 0.0), ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, nocap);
    let totalDefenceMod = applyCap(d.defenceMod + (localMods["d"] || 0.0), ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, nocap);
    let totalPowerMod = applyCap(d.powerMod + (localMods["p"] || 0.0), POWERMOD_SPECIALATKMOD_LOWER_BOUND, POWERMOD_SPECIALATKMOD_UPPER_BOUND, nocap);
    let totalNpDamageMod = applyCap(d.npDamageMod + (localMods["n"] || 0.0), CRITDMG_NPDMG_LOWER_BOUND, CRITDMG_NPDMG_UPPER_BOUND, nocap);
    let totalSpecialDefenceMod = applyCap(d.specialDefenceMod + (localMods["sdm"] || 0.0), SPECIALDEFMOD_LOWER_BOUND, SPECIALDEFMOD_UPPER_BOUND, nocap);
    let totalSpecialAttackMod = applyCap(d.specialAttackMod + (localMods["sam"] || 0.0), POWERMOD_SPECIALATKMOD_LOWER_BOUND, POWERMOD_SPECIALATKMOD_UPPER_BOUND, nocap);
    let totalGlobalCritDamageMod = d.critDamageMod + (localMods["cd"] || 0.0);

    let cardColorModTotal = 0, colorSpecificCritBonus = 0, npModTotal = 0, seMod = 1.0;

    switch (cardType) {
      case "a":
        cardColorModTotal = d.artsMod + (localMods["am"] || 0.0) + (d.artsPower + (localMods["ap"] || 0.0));
        colorSpecificCritBonus = d.artsCritDamageMod + (localMods["acd"] || 0.0);
        break;
      case "b":
        cardColorModTotal = d.busterMod + (localMods["bm"] || 0.0) + (d.busterPower + (localMods["bp"] || 0.0));
        colorSpecificCritBonus = d.busterCritDamageMod + (localMods["bcd"] || 0.0);
        break;
      case "q":
        cardColorModTotal = d.quickMod + (localMods["qm"] || 0.0) + (d.quickPower + (localMods["qp"] || 0.0));
        colorSpecificCritBonus = d.quickCritDamageMod + (localMods["qcd"] || 0.0);
        break;
      case "np":
        if (g.npCardType === "arts") cardColorModTotal = d.artsMod + (localMods["am"] || 0.0) + (d.artsPower + (localMods["ap"] || 0.0));
        else if (g.npCardType === "buster") cardColorModTotal = d.busterMod + (localMods["bm"] || 0.0) + (d.busterPower + (localMods["bp"] || 0.0));
        else if (g.npCardType === "quick") cardColorModTotal = d.quickMod + (localMods["qm"] || 0.0) + (d.quickPower + (localMods["qp"] || 0.0));
        npModTotal = totalNpDamageMod * (1.0 + d.npPowerBoost / 100.0);
        let localSe = localMods["se"] || 0.0;
        if (localSe > 0.0) seMod = localSe;
        else if (d.superEffectiveMod > 0.0) seMod = d.superEffectiveMod;
        break;
    }

    cardColorModTotal = applyCap(cardColorModTotal, ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, nocap);
    npModTotal = applyCap(npModTotal, CRITDMG_NPDMG_LOWER_BOUND, CRITDMG_NPDMG_UPPER_BOUND, nocap);

    let totalCritDamageMod = applyCap(totalGlobalCritDamageMod + colorSpecificCritBonus, CRITDMG_NPDMG_LOWER_BOUND, CRITDMG_NPDMG_UPPER_BOUND, nocap);
    let critDamageStackPercentage = isCrit ? totalCritDamageMod / 100.0 : 0.0;
    let finalCritFactor = isCrit ? BASE_CRIT_DAMAGE_FACTOR : 1.0;

    let baseAttack = g.resolvedBaseAttack + currentFouPawAttack;
    let baseDamage = baseAttack * BASE_DAMAGE_MULTIPLIER * g.advantages.classAtkMultiplier;

    let totalAttackDefenseStack = Math.max(1.0 + (totalAttackMod - totalDefenceMod) / 100.0, MIN_STACK_VALUE);
    let totalCardColorStack = firstCardBonus + cardDamageMultiplier * positionMultiplier * Math.max(1.0 + cardColorModTotal / 100.0, MIN_STACK_VALUE);
    let totalPowerNPStack = Math.max((1.0 + totalPowerMod / 100.0 + npModTotal / 100.0 + critDamageStackPercentage) * finalCritFactor, MIN_POWER_STACK_VALUE);
    let totalSpecialDefenseMod = Math.max(1.0 - totalSpecialDefenceMod / 100.0, MIN_STACK_VALUE);
    let totalSAM = Math.max(1.0 + totalSpecialAttackMod / 100.0, MIN_POWER_STACK_VALUE);
    let totalSuperEffectiveMod = cardType === "np" && seMod > 1.0 ? seMod / 100.0 : 1.0;
    
    let finalDamageRateMod = resolvedDr / 100.0;

    return (
      baseDamage * totalAttackDefenseStack * totalCardColorStack * totalPowerNPStack * totalSpecialDefenseMod * totalSAM * totalSuperEffectiveMod * g.advantages.attributeMultiplier * g.advantages.classAdvantageMultiplier * finalDamageRateMod
    );
  },

  /**
   * Applies Extra Attack specific scaling logic.
   * @returns {number} The theoretical damage for the Extra strike.
   */
  calculateExtraAttackDamage(servant, buffs, g, isBraveChainMatch, firstCardBonus, resolvedDr) {
    let classAtkMultiplier = g.advantages.classAtkMultiplier;
    let localMods = buffs.cardMods[EXTRA_ATTACK_POSITION] || {};
    let d = g.damageMods;
    let nocap = buffs.getFlag("nocap");

    let totalAttackMod = applyCap(d.attackMod + (localMods["a"] || 0.0), ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, nocap);
    let totalDefenceMod = applyCap(d.defenceMod + (localMods["d"] || 0.0), ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, nocap);
    let totalExtraMod = applyCap(d.extraMod + (localMods["em"] || 0.0), ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, nocap);
    let totalExtraPower = applyCap(d.extraPower + (localMods["ep"] || 0.0), CRITDMG_NPDMG_LOWER_BOUND, CRITDMG_NPDMG_UPPER_BOUND, nocap);
    let totalPowerMod = applyCap(d.powerMod + (localMods["p"] || 0.0), POWERMOD_SPECIALATKMOD_LOWER_BOUND, POWERMOD_SPECIALATKMOD_UPPER_BOUND, nocap);
    let totalSpecialDefenceMod = applyCap(d.specialDefenceMod + (localMods["sdm"] || 0.0), SPECIALDEFMOD_LOWER_BOUND, SPECIALDEFMOD_UPPER_BOUND, nocap);
    let totalSpecialAttackMod = applyCap(d.specialAttackMod + (localMods["sam"] || 0.0), POWERMOD_SPECIALATKMOD_LOWER_BOUND, POWERMOD_SPECIALATKMOD_UPPER_BOUND, nocap);

    let cardColorModTotal = applyCap(totalExtraMod + totalExtraPower, ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, nocap);

    let extraAttackMultiplier = g.extraCardModOverride !== 0.0 ? g.extraCardModOverride : isBraveChainMatch ? BRAVE_CHAIN_EXTRA_MULTIPLIER : EXTRA_ATTACK_MULTIPLIER;

    let baseAttack = g.resolvedBaseAttack;
    let baseDamage = baseAttack * BASE_DAMAGE_MULTIPLIER * extraAttackMultiplier * classAtkMultiplier;

    let totalAttackDefenseStack = Math.max(1.0 + (totalAttackMod - totalDefenceMod) / 100.0, MIN_STACK_VALUE);
    let totalPowerExtraStack = Math.max(1.0 + totalPowerMod / 100.0, MIN_POWER_STACK_VALUE);
    let totalCardColorStack = firstCardBonus + Math.max(1.0 + cardColorModTotal / 100.0, MIN_STACK_VALUE);
    let totalSpecialDefenseMod = Math.max(1.0 - totalSpecialDefenceMod / 100.0, MIN_STACK_VALUE);
    let totalSAM = Math.max(1.0 + totalSpecialAttackMod / 100.0, MIN_POWER_STACK_VALUE);

    let finalDamageRateMod = resolvedDr / 100.0;

    return (
      baseDamage * totalAttackDefenseStack * totalCardColorStack * totalPowerExtraStack * totalSpecialDefenseMod * totalSAM * g.advantages.attributeMultiplier * g.advantages.classAdvantageMultiplier * finalDamageRateMod
    );
  }
};