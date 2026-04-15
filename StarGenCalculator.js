/**
 * @file StarGenCalculator.js
 * @description Decoupled module handling Star Generation drop probability logic.
 */

import {
  applyCap,
  ATK_DEF_CARDMOD_LOWER_BOUND,
  ATK_DEF_CARDMOD_UPPER_BOUND,
  POWERMOD_SPECIALATKMOD_LOWER_BOUND,
  POWERMOD_SPECIALATKMOD_UPPER_BOUND,
  CRITDMG_NPDMG_LOWER_BOUND
} from "./CalculationEngine.js";

export const FIRST_CARD_QUICK_BONUS = 20.0;
const STAR_GEN_CRIT_MODIFIER = 20.0;
export const STAR_GEN_OVERKILL_ADD = 30.0;
export const STAR_GEN_MAX_CHANCE = 300.0;
const CARD_STAR_VALUES = {
  a: [0.0, 0.0, 0.0],
  b: [10.0, 15.0, 20.0],
  q: [80.0, 130.0, 180.0],
};
const EXTRA_CARD_STAR_VALUE = 100.0;

export const StarGenCalculator = {
  /**
   * Resolves the percentage likelihood for an attack to generate a critical star.
   * @param {Object} servant - The active servant object.
   * @param {Object} g - Evaluated global parameters.
   * @param {Object} localMods - Sub-dictionary of card-specific buffs.
   * @param {string} currentCardToken - Identifying card type.
   * @param {number} actualPosition - Ordered location in the chain.
   * @param {number} firstCardBonus - Retained bonus modifiers.
   * @param {boolean} isCrit - Modifies likelihood based on strike severity.
   * @param {boolean} isNonDamagingNP - Truncates logic entirely for non-damaging arts.
   * @param {number} resolvedSgr - The resolved Star Gen Rate modifier.
   * @returns {number} Floating point base probability to generate a star per hit.
   */
  getBaseStarChance(servant, g, localMods, currentCardToken, actualPosition, firstCardBonus, isCrit, isNonDamagingNP, resolvedSgr) {
    if (isNonDamagingNP) return 0.0;

    let cardStarValue = 0.0;
    let cardSpecificStarGenMod = 0.0;
    let effectiveCardType = currentCardToken === "np" ? g.npCardType.charAt(0).toLowerCase() : currentCardToken;

    const finalStarGenRateMod = resolvedSgr / 100.0;

    if (currentCardToken === "e") {
      let extraCardMod = applyCap(g.damageMods.extraMod + (localMods["em"] || 0.0), ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, false);
      let starGenMod = applyCap(g.starGenMods.stargen + (localMods["sg"] || 0.0), CRITDMG_NPDMG_LOWER_BOUND, POWERMOD_SPECIALATKMOD_UPPER_BOUND, false);
      return (servant.starRate / 10.0 + firstCardBonus + EXTRA_CARD_STAR_VALUE * (1.0 + extraCardMod / 100.0) + g.starGenMods.enemyServerRate + starGenMod) * finalStarGenRateMod;
    }

    let starValueIndex = currentCardToken === "np" ? 0 : Math.min(actualPosition, 3) - 1;

    switch (effectiveCardType) {
      case "a":
        cardStarValue = CARD_STAR_VALUES["a"][starValueIndex];
        cardSpecificStarGenMod = g.starGenMods.artsStarGenMod + (localMods["asg"] || 0.0);
        break;
      case "b":
        cardStarValue = CARD_STAR_VALUES["b"][starValueIndex];
        cardSpecificStarGenMod = g.starGenMods.busterStarGenMod + (localMods["bsg"] || 0.0);
        break;
      case "q":
        cardStarValue = CARD_STAR_VALUES["q"][starValueIndex];
        cardSpecificStarGenMod = g.starGenMods.quickStarGenMod + (localMods["qsg"] || 0.0);
        break;
    }

    let cardMod = 0;
    switch (effectiveCardType) {
      case "a": cardMod = g.damageMods.artsMod + (localMods["am"] || 0.0); break;
      case "b": cardMod = g.damageMods.busterMod + (localMods["bm"] || 0.0); break;
      case "q": cardMod = g.damageMods.quickMod + (localMods["qm"] || 0.0); break;
    }

    cardMod = applyCap(cardMod, ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, false);
    let starGenMod = applyCap(g.starGenMods.stargen + cardSpecificStarGenMod + (localMods["sg"] || 0.0), CRITDMG_NPDMG_LOWER_BOUND, POWERMOD_SPECIALATKMOD_UPPER_BOUND, false);

    let critMod = isCrit ? STAR_GEN_CRIT_MODIFIER : 0.0;

    return (servant.starRate / 10.0 + firstCardBonus + cardStarValue * Math.max(1.0 + cardMod / 100.0, 0) + g.starGenMods.enemyServerRate + starGenMod + critMod) * finalStarGenRateMod;
  }
};