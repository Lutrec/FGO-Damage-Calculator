/**
 * @file RefundCalculator.js
 * @description Decoupled module strictly handling NP Gain (Refund) formulas.
 */

import {
  applyCap,
  ATK_DEF_CARDMOD_LOWER_BOUND,
  ATK_DEF_CARDMOD_UPPER_BOUND,
  CRITDMG_NPDMG_LOWER_BOUND,
  CRITDMG_NPDMG_UPPER_BOUND
} from "./CalculationEngine.js";

import { MIN_NP_LEVEL, MAX_NP_LEVEL, DEFAULT_NP_LEVEL } from "./DamageCalculator.js";

export const OVERKILL_MODIFIER = 1.5;
const ARTS_CARD_NP_VALUE = 3.0;
const QUICK_CARD_NP_VALUE = 1.0;
const BUSTER_CARD_NP_VALUE = 0.0;
const EXTRA_CARD_NP_VALUE = 1.0;
export const FIRST_CARD_ARTS_BONUS = 1.0;
const NP_POSITION_MULTIPLIERS = [0.0, 1.0, 1.5, 2.0];

export const RefundCalculator = {
  /**
   * Distributes logic to find the exact decimal value for NP regeneration per standard strike.
   * @param {Object} buffs - Current active buffs.
   * @param {Object} g - Evaluated global parameters.
   * @param {Object} localMods - Positional sub-modifiers mapping.
   * @param {string} currentCardToken - Identifying string token.
   * @param {number} actualPosition - Ordered location of this strike in the chain.
   * @param {number} artsFirstCardBonus - Chained multiplier additive.
   * @param {boolean} isCrit - Critical hit evaluation flag.
   * @param {number} resolvedNgr - The resolved NP Gain Rate modifier.
   * @returns {number} Non-floored numerical value corresponding to returned base charge.
   */
  calculateSingleHitRefund(buffs, g, localMods, currentCardToken, actualPosition, artsFirstCardBonus, isCrit, resolvedNgr) {
    let nocap = buffs.getFlag("nocap");
    let cardBaseNpValue = 0.0;
    let cardMod = 0.0;
    let posMod = actualPosition >= 1 && actualPosition <= 3 ? NP_POSITION_MULTIPLIERS[actualPosition] : 1.0;
    let cardSpecificNpGainMod = 0.0;
    let baseNpRate;

    switch (currentCardToken) {
      case "a":
        cardBaseNpValue = ARTS_CARD_NP_VALUE;
        cardMod = g.damageMods.artsMod + (localMods["am"] || 0.0);
        baseNpRate = g.npRateCard;
        cardSpecificNpGainMod = g.npGainMods.artsNpGainMod + (localMods["ang"] || 0.0);
        break;
      case "b":
        cardBaseNpValue = BUSTER_CARD_NP_VALUE;
        cardMod = g.damageMods.busterMod + (localMods["bm"] || 0.0);
        baseNpRate = g.npRateCard;
        cardSpecificNpGainMod = g.npGainMods.busterNpGainMod + (localMods["bng"] || 0.0);
        break;
      case "q":
        cardBaseNpValue = QUICK_CARD_NP_VALUE;
        cardMod = g.damageMods.quickMod + (localMods["qm"] || 0.0);
        baseNpRate = g.npRateCard;
        cardSpecificNpGainMod = g.npGainMods.quickNpGainMod + (localMods["qng"] || 0.0);
        break;
      case "np":
        posMod = 1.0;
        baseNpRate = g.npRateNP;

        let npLevel = Math.floor(g.damageMods.npLevelValue || DEFAULT_NP_LEVEL);
        if (npLevel <= 0 || npLevel > MAX_NP_LEVEL) npLevel = DEFAULT_NP_LEVEL;
        let npDamageOverride = g.damageMods.npDamageOverride;
        let npDamageMod = g.npDamageStat && g.npDamageStat.length >= npLevel ? g.npDamageStat[npLevel - 1] : 0.0;

        let isNonDamagingNP = npDamageOverride === 0.0 && npDamageMod === 0.0;
        if (isNonDamagingNP) {
          cardBaseNpValue = 0.0;
          cardMod = 0.0;
        } else {
          if (g.npCardType === "arts") {
            cardBaseNpValue = ARTS_CARD_NP_VALUE;
            cardMod = g.damageMods.artsMod + (localMods["am"] || 0.0);
            cardSpecificNpGainMod = g.npGainMods.artsNpGainMod + (localMods["ang"] || 0.0);
          } else if (g.npCardType === "quick") {
            cardBaseNpValue = QUICK_CARD_NP_VALUE;
            cardMod = g.damageMods.quickMod + (localMods["qm"] || 0.0);
            cardSpecificNpGainMod = g.npGainMods.quickNpGainMod + (localMods["qng"] || 0.0);
          } else {
            cardBaseNpValue = BUSTER_CARD_NP_VALUE;
            cardMod = g.damageMods.busterMod + (localMods["bm"] || 0.0);
            cardSpecificNpGainMod = g.npGainMods.busterNpGainMod + (localMods["bng"] || 0.0);
          }
        }
        break;
      default:
        baseNpRate = g.npRateCard;
    }

    let totalNpGainMod = g.npGainMods.npGainMod + (localMods["ng"] || 0.0) + cardSpecificNpGainMod;

    cardMod = applyCap(cardMod, ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, nocap);
    totalNpGainMod = applyCap(totalNpGainMod, CRITDMG_NPDMG_LOWER_BOUND, CRITDMG_NPDMG_UPPER_BOUND, nocap);

    let cardModVal = cardMod / 100.0;
    let npGainModVal = totalNpGainMod / 100.0;

    let cardNpValue = cardBaseNpValue * posMod;
    let enemyModVal = g.npGainMods.enemyServerMod;
    let critModVal = isCrit ? 2.0 : 1.0;
    let finalArtsFirstBonus = currentCardToken === "np" ? 0.0 : artsFirstCardBonus;
    
    let finalNpGainRateMod = resolvedNgr / 100.0;

    return (
      baseNpRate * (finalArtsFirstBonus + cardNpValue * (1.0 + cardModVal)) * enemyModVal * (1.0 + npGainModVal) * critModVal * finalNpGainRateMod
    );
  },

  /**
   * Translates distinct Extra Card mechanics into gauge charge values.
   * @returns {number} The expected base refund for an extra hit.
   */
  calculateExtraHitRefund(buffs, g, localMods, isCrit, artsFirstCardBonus, resolvedNgr) {
    let nocap = buffs.getFlag("nocap");
    let cardNpValue = EXTRA_CARD_NP_VALUE;

    let cardMod = g.damageMods.extraMod + (localMods["em"] || 0.0);
    let totalNpGainMod = g.npGainMods.npGainMod + (localMods["ng"] || 0.0);

    cardMod = applyCap(cardMod, ATK_DEF_CARDMOD_LOWER_BOUND, ATK_DEF_CARDMOD_UPPER_BOUND, nocap);
    totalNpGainMod = applyCap(totalNpGainMod, CRITDMG_NPDMG_LOWER_BOUND, CRITDMG_NPDMG_UPPER_BOUND, nocap);

    let cardModVal = cardMod / 100.0;
    let npGainModVal = totalNpGainMod / 100.0;

    let enemyModVal = g.npGainMods.enemyServerMod;
    let critModVal = isCrit ? 2.0 : 1.0;
    
    let finalNpGainRateMod = resolvedNgr / 100.0;

    return (
      g.npRateCard * (artsFirstCardBonus + cardNpValue * (1.0 + cardModVal)) * enemyModVal * (1.0 + npGainModVal) * critModVal * finalNpGainRateMod
    );
  }
};