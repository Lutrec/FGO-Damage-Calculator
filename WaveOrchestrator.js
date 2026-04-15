/**
 * @file WaveOrchestrator.js
 * @description Manages battle simulations spanning one or more waves. Decouples sequential evaluations
 * ensuring logic resolves predictably and transient modifiers map correctly per phase.
 */

import { GameDataLoader } from "./GameDataLoader.js";
import { InputParser } from "./InputParser.js";
import { CalculationEngine } from "./CalculationEngine.js";

export const WaveOrchestrator = {
  /**
   * Distributes a complex raw input command into structured, sequential battle phases.
   * @param {string} input - The raw user-provided execution command.
   * @returns {Object[]} Sequential array comprising the metrics for each parsed wave phase.
   * @throws {Error} Throws if parsing fails or servant identifier remains absent.
   */
  simulateBattle(input) {
    const normalizedInput = input.trim().replace(/\s+/g, " ");
    if (!normalizedInput) throw new Error("Error: No input provided.");

    const firstSpaceIndex = normalizedInput.indexOf(" ");
    let servantToken = "";
    let inputBody = "";

    if (firstSpaceIndex === -1) {
      servantToken = normalizedInput.toLowerCase();
    } else {
      servantToken = normalizedInput.substring(0, firstSpaceIndex).toLowerCase();
      inputBody = normalizedInput.substring(firstSpaceIndex + 1).trim();
    }

    const servant = GameDataLoader.SERVANT_MAP[servantToken];
    if (!servant) throw new Error(`Servant not found: ${servantToken}`);

    const waveRegex = /\[(.*?)\]/g;
    let waveStrings = [];
    let match;
    while ((match = waveRegex.exec(inputBody)) !== null) {
      waveStrings.push(match[1].trim());
    }

    const isMultiWave = waveStrings.length > 0;
    const wavesToProcess = isMultiWave ? waveStrings : [inputBody];
    const globalString = isMultiWave ? inputBody.replace(/\[.*?\]/g, " ").trim() : inputBody;

    let globalBuffs = InputParser.parseBuffs(servant.passiveStat || "").buffs;
    if (globalString !== "") {
      const globalParseResult = InputParser.parseBuffs(globalString);
      globalBuffs = this.mergeBuffs(globalBuffs, globalParseResult.buffs);
    }

    const results = [];

    for (let i = 0; i < wavesToProcess.length; i++) {
      const waveString = wavesToProcess[i];
      const waveCardChain = InputParser.extractCardChain(waveString);
      const waveParseResult = InputParser.parseBuffs(waveString);

      const totalBuffs = isMultiWave ? this.mergeBuffs(globalBuffs, waveParseResult.buffs) : globalBuffs;
      const snapshotInfo = CalculationEngine.createBuffSnapshot(servant, totalBuffs);
      snapshotInfo.snapshot.damageMods.npLevelValue = totalBuffs.npLevel;

      const fullResult = CalculationEngine.calculateCardChainDamage(servant, totalBuffs, snapshotInfo.snapshot, waveCardChain);

      const npLevelVal = totalBuffs.npLevel || 5;
      const npOverride = snapshotInfo.snapshot.damageMods.npDamageOverride || 0;
      const npModPercentage = npOverride > 0 ? npOverride : snapshotInfo.snapshot.npDamageStat[npLevelVal - 1] || 0;
      const fouVal = totalBuffs.mods["f"] !== undefined ? totalBuffs.getMod("f") : 1000;
      const ceVal = totalBuffs.getMod("ce") || 0;
      const fpVal = totalBuffs.getMod("fp") || 0;
      const baseAtk = snapshotInfo.snapshot.resolvedBaseAttack - fouVal - ceVal;
      const reqLevel = totalBuffs.requestedLevel > 0 ? totalBuffs.requestedLevel : servant.levelDefault;
      const strVal = totalBuffs.str !== 0 ? totalBuffs.str : totalBuffs.getMod("str") || 0;

      results.push({
        waveIndex: i + 1,
        chain: waveCardChain || "NP",
        servantName: servant.name,
        servantClass: servant.classType,
        servantId: servant.id,
        servantLink: servant.link,
        npLevel: npLevelVal,
        npDamageMod: npModPercentage,
        baseAtk: baseAtk,
        fou: fouVal,
        ce: ceVal,
        fouPaw: fpVal,
        level: reqLevel,
        str: strVal,
        snapshot: snapshotInfo.snapshot,
        data: fullResult,
        buffs: totalBuffs,
      });
    }

    return results;
  },

  /**
   * Reconciles transient positional identifiers merging scoped objects beneath persistent global configurations.
   * @param {Object} global - The persistent global configuration.
   * @param {Object} wave - Localized sub-configurations isolated to this explicit wave block.
   * @returns {Object} Unified buff definition block for calculation.
   */
  mergeBuffs(global, wave) {
    const newMods = {...global.mods};
    const newFlags = {...global.flags};
    for (const [k, v] of Object.entries(wave.mods)) newMods[k] = (newMods[k] || 0) + v;
    for (const [k, v] of Object.entries(wave.flags)) newFlags[k] = v;

    const newCardMods = {1: {}, 2: {}, 3: {}, 4: {}};
    const newCardFlags = {1: {}, 2: {}, 3: {}, 4: {}};
    for (let i = 1; i <= 4; i++) {
      newCardMods[i] = { ...(global.cardMods[i] || {}), ...(wave.cardMods[i] || {}) };
      newCardFlags[i] = { ...(global.cardFlags[i] || {}), ...(wave.cardFlags[i] || {}) };
    }

    return {
      ...global,
      mods: newMods,
      flags: newFlags,
      cardMods: newCardMods,
      cardFlags: newCardFlags,
      enemyHp: wave.enemyHp !== Number.MAX_SAFE_INTEGER ? wave.enemyHp : global.enemyHp,
      enemyAttribute: wave.enemyAttribute !== "none" ? wave.enemyAttribute : global.enemyAttribute,
      enemyClass: wave.enemyClass !== "shielder" ? wave.enemyClass : global.enemyClass,
      npLevel: wave.npLevel !== 5 ? wave.npLevel : global.npLevel,
      requestedLevel: wave.requestedLevel !== 0 ? wave.requestedLevel : global.requestedLevel,
      str: wave.str !== 0 ? wave.str : global.str,
      overchargeLevel: wave.overchargeLevel !== 1 ? wave.overchargeLevel : global.overchargeLevel,
      getMod(k) { return this.mods[k] || 0; },
      getFlag(k) { return !!this.flags[k]; },
    };
  }
};