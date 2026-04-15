/**
 * @file ProbabilityCalculator.js
 * @description Executes the Monte Carlo analysis determining wave success probability.
 */

const MONTE_CARLO_ATTEMPTS = 500000;

export const ProbabilityCalculator = {
  /**
   * Executes a Monte Carlo simulation evaluating the probability of a lethal blow based on the 0.9x ~ 1.099x damage spread.
   * @param {number[]} avgCardDamages - Array containing the raw average damage output for each card evaluated.
   * @param {number} enemyHp - The targeted enemy HP threshold.
   * @returns {number} A float (0.0 to 1.0) representing the success rate.
   */
  calculateSuccessProbability(avgCardDamages, enemyHp) {
    if (enemyHp >= Number.MAX_SAFE_INTEGER) return 0;
    const damageNeeded = enemyHp * 1000;
    let successCount = 0;
    
    for (let i = 0; i < MONTE_CARLO_ATTEMPTS; i++) {
      let totalSimulatedDamage = 0;
      for (let j = 0; j < avgCardDamages.length; j++) {
        totalSimulatedDamage += avgCardDamages[j] * (900 + Math.random() * 200);
      }
      if (totalSimulatedDamage >= damageNeeded) successCount++;
    }
    
    return successCount / MONTE_CARLO_ATTEMPTS;
  }
};