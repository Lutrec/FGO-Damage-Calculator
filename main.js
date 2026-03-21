import {GameDataLoader} from "./GameDataLoader.js";
import {WaveOrchestrator} from "./WaveOrchestrator.js";

document.addEventListener("DOMContentLoaded", async () => {
  const calcInput = document.getElementById("calcInput");
  const chatContainer = document.getElementById("chatContainer");

  // Avatars
  const BOT_AVATAR = "./assets/wickedNero.png";
  const USER_AVATAR =
    "https://static.atlasacademy.io/JP/MasterFace/equip00441.png";

  // --- HISTORY MANAGEMENT ---
  let history = JSON.parse(localStorage.getItem("fgoCalcHistory")) || [];

  function saveState() {
    // Keep only the last 50 items to prevent DOM bloat and storage crashes
    if (history.length > 50) {
      history = history.slice(-50);
    }
    localStorage.setItem("fgoCalcHistory", JSON.stringify(history));
  }

  // --- HELP MODAL LOGIC ---
  const helpBtn = document.getElementById("helpBtn");
  const helpModal = document.getElementById("helpModal");
  const closeModalBtn = document.getElementById("closeModalBtn");

  // Clear Button Logic
  const clearBtn = document.getElementById("clearBtn");

  clearBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear your calculation history?")) {
      localStorage.removeItem("fgoCalcHistory");
      history = [];
      chatContainer.innerHTML = "";
      calcInput.style.height = "auto";

      // Post a fresh greeting that doesn't save to the new empty history
      appendBotMessage(
        "Chat history cleared. Ready for new calculations!",
        false,
        null,
        false
      );
    }
  });

  helpBtn.addEventListener("click", () => {
    helpModal.style.display = "flex";
  });

  closeModalBtn.addEventListener("click", () => {
    helpModal.style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target === helpModal) {
      helpModal.style.display = "none";
    }
  });

  // --- INITIALIZATION ---
  try {
    await GameDataLoader.initialize();
    calcInput.disabled = false;
    calcInput.placeholder = "Message #fgo-calculator (e.g., nero a44 am30)";

    // Render previous history
    history.forEach((item) => {
      if (item.type === "bot")
        appendBotMessage(item.text, item.isError, item.time, false);
      else if (item.type === "user")
        appendUserMessage(item.text, item.time, false);
      else if (item.type === "embed")
        appendCalculationEmbed(item.waves, item.time, false);
    });

    // Welcome message (prevented from saving to history)
    appendBotMessage(
      "Data loaded successfully! Type your command below and press Enter.",
      false,
      null,
      false
    );
  } catch (err) {
    console.error("Startup Crash:", err);
    appendBotMessage(`Failed to load JSON data: ${err.message}`, true, null, false);
  }

  // --- INPUT HANDLING ---
  calcInput.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";

    if (this.scrollHeight > 200) {
      this.style.overflowY = "auto";
    } else {
      this.style.overflowY = "hidden";
    }
  });

  calcInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const input = calcInput.value.trim();
      if (!input) return;

      appendUserMessage(input);
      calcInput.value = "";
      calcInput.style.height = "auto";

      try {
        const waves = WaveOrchestrator.simulateBattle(input);
        if (waves.length > 0) {
          appendCalculationEmbed(waves);
        }
      } catch (err) {
        appendBotMessage(`**Error:** ${err.message}`, true);
      }
    }
  });

  // --- UI HELPERS ---
  function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function getTimeString() {
    const now = new Date();
    return now.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
  }

  function appendBotMessage(text, isError = false, time = null, save = true) {
    const msgTime = time || getTimeString();
    const msgDiv = document.createElement("div");
    msgDiv.className = "message";
    if (save) msgDiv.classList.add("animate-message");

    msgDiv.innerHTML = `
            <img class="avatar" src="${BOT_AVATAR}" alt="Bot">
            <div class="msg-content">
                <div class="msg-header">
                    <span class="username" style="${isError ? "color:#ed4245;" : ""}">Nerone</span><span class="bot-tag">BOT</span>
                    <span class="timestamp">Today at ${msgTime}</span>
                </div>
                <div class="msg-text">${text}</div>
            </div>
        `;
    chatContainer.appendChild(msgDiv);
    scrollToBottom();

    if (save) {
      history.push({type: "bot", text, isError, time: msgTime});
      saveState();
    }
  }

  function appendUserMessage(text, time = null, save = true) {
    const msgTime = time || getTimeString();
    const msgDiv = document.createElement("div");
    msgDiv.className = "message";
    if (save) msgDiv.classList.add("animate-message");

    msgDiv.innerHTML = `
            <img class="avatar" src="${USER_AVATAR}" alt="User">
            <div class="msg-content">
                <div class="msg-header">
                    <span class="username">Master</span>
                    <span class="timestamp">Today at ${msgTime}</span>
                </div>
                <div class="msg-text">${text}</div>
            </div>
            <button class="copy-btn">Copy</button>
        `;

    const copyBtn = msgDiv.querySelector(".copy-btn");
    copyBtn.addEventListener("click", () => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          const originalText = copyBtn.innerText;
          copyBtn.innerText = "Copied!";
          copyBtn.style.color = "#57F287";
          setTimeout(() => {
            copyBtn.innerText = originalText;
            copyBtn.style.color = "#dbdee1";
          }, 1500);
        })
        .catch((err) => {
          console.error("Failed to copy text: ", err);
        });
    });

    chatContainer.appendChild(msgDiv);
    scrollToBottom();

    if (save) {
      history.push({type: "user", text, time: msgTime});
      saveState();
    }
  }

  // --- EMBED GENERATOR ---
  function appendCalculationEmbed(waves, time = null, save = true) {
    const msgTime = time || getTimeString();
    let currentWaveIndex = 0;
    const isMultiWave = waves.length > 1;

    const capitalize = (s) =>
      s && s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

    const getClassIconUrl = (cls) => {
      const idMap = {
        saber: 1,
        archer: 2,
        lancer: 3,
        rider: 4,
        caster: 5,
        assassin: 6,
        berserker: 7,
        shielder: 8,
        ruler: 9,
        alterego: 10,
        alteregokiara: 10,
        avenger: 11,
        mooncancer: 23,
        mooncancerciel: 23,
        foreigner: 25,
        pretender: 28,
        beast: 33,
        beastdraco: 33,
        beasteresh: 33,
        beastolga: 33,
        beast1: 34,
        beast1lost: 34,
        beast2: 34,
        beast3r: 34,
        beast3l: 34,
        beast4: 34,
        beast6: 34,
      };

      const id = idMap[cls?.toLowerCase()] || 97;
      return `https://static.atlasacademy.io/JP/ClassIcons/class3_${id}.png`;
    };

    const getBuffIcon = (id) =>
      `<img src="https://static.atlasacademy.io/JP/BuffIcons/bufficon_${id}.png" style="width: 16px; height: 16px; margin-right: 6px;" alt="">`;

    const getSkillIcon = (id) =>
      `<img src="https://static.atlasacademy.io/JP/SkillIcons/skill_${id}.png" style="width: 16px; height: 16px; margin-right: 6px;" alt="">`;

    const getColoredChain = (chain) => {
      if (!chain) return "";

      const tokens = chain.toUpperCase().match(/(NP|EX|E|B|A|Q|X)/g);
      if (!tokens) return chain.toUpperCase();

      return tokens
        .map((token) => {
          if (token === "X") {
            return `<span style="font-weight: bold; vertical-align: middle; margin: 0 2px;">${token}</span>`;
          }

          let iconUrl = "";
          if (token === "B") iconUrl = "./assets/buster.png";
          else if (token === "A") iconUrl = "./assets/arts.png";
          else if (token === "Q") iconUrl = "./assets/quick.png";
          else if (token === "NP") iconUrl = "./assets/np.png";
          else if (token === "E" || token === "EX")
            iconUrl = "./assets/extra.png";

          return `<img src="${iconUrl}" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 2px;" alt="${token}">`;
        })
        .join("");
    };

    const formatBuffs = (snapshot) => {
      const d = snapshot.damageMods;
      const n = snapshot.npGainMods;
      const s = snapshot.starGenMods;

      const buffLine = (id, label, value) =>
        `<div style="display: flex; align-items: center; margin-bottom: 4px; break-inside: avoid;">
            ${getBuffIcon(id)} <span><strong>${label}:</strong> ${value}</span>
         </div>`;

      return (
        buffLine(300, "ATK", `${d.attackMod}%`) +
        buffLine(301, "DEF", `${d.defenceMod}%`) +
        buffLine(313, "Arts Mod", `${d.artsMod}%`) +
        buffLine(314, "Buster Mod", `${d.busterMod}%`) +
        buffLine(312, "Quick Mod", `${d.quickMod}%`) +
        buffLine(388, "Extra Mod", `${d.extraMod}%`) +
        buffLine(310, "NP Dmg", `${d.npDamageMod}%`) +
        buffLine(370, "NP Dmg Boost", `${d.npPowerBoost}%`) +
        buffLine(302, "Power Mod", `${d.powerMod}%`) +
        buffLine(324, "Crit Dmg", `${d.critDamageMod}%`) +
        buffLine(359, "Special ATK Mod", `${d.specialAttackMod}%`) +
        buffLine(334, "Special DEF Mod", `${d.specialDefenceMod}%`) +
        buffLine(336, "Super Effective Mod", `${d.superEffectiveMod}%`) +
        buffLine(303, "NP Gain", `${n.npGainMod}%`) +
        buffLine(321, "Star Gen", `${s.stargen}%`) +
        buffLine(302, "Flat Dmg/Dmg Cut", d.flatDamage)
      );
    };

    const buildEnemyHtml = (snapshot) => {
      const enemyClass = snapshot.enemy.enemyClass;
      const enemyAttr = snapshot.enemy.enemyAttribute;
      const enemyHp = snapshot.enemy.enemyHp;

      const isClassOmitted = enemyClass === "shielder";
      const isAttrOmitted = enemyAttr === "none";
      const isHpOmitted = enemyHp > 1000000000000;

      const classIconUrl = isClassOmitted
        ? "https://static.atlasacademy.io/JP/ClassIcons/class3_97.png"
        : getClassIconUrl(enemyClass);
      const attrText = isAttrOmitted ? "" : `[${capitalize(enemyAttr)}] `;

      const hpText = isHpOmitted
        ? ""
        : `<span style="margin-left: 6px;"><strong>HP:</strong> ${Math.floor(enemyHp).toLocaleString()}</span>`;

      return `
        <div style="display: flex; align-items: center; margin-bottom: 4px; font-size: 0.9rem;">
            <img src="${classIconUrl}" style="width: 18px; height: 18px; margin-right: 6px;" alt="Class">
            <strong>${attrText}Enemy</strong>
            ${hpText}
        </div>
      `;
    };

    const msgDiv = document.createElement("div");
    msgDiv.className = "message";
    if (save) msgDiv.classList.add("animate-message");

    msgDiv.innerHTML = `
            <img class="avatar" src="${BOT_AVATAR}" alt="Bot">
            <div class="msg-content">
                <div class="msg-header">
                    <span class="username">Nerone</span><span class="bot-tag">BOT</span>
                    <span class="timestamp">Today at ${msgTime}</span> </div>
                <div class="embed">
                    <div class="embed-header">
                        <div>
                            <div class="embed-title"></div>
                            <div class="embed-subtitle" style="margin-top: 4px; font-size: 0.9rem;"></div>
                        </div>
                        <img class="embed-thumbnail" src="" alt="Servant">
                    </div>
                    
                    <div class="summary-container" style="display: none;"></div>

                    <div class="wave-container">
                        <div class="detailed-view-container" style="display: none; margin-bottom: 12px; border-bottom: 1px solid #3f4147; padding-bottom: 10px;">
                            <div class="field">
                                <div class="field-name">Servant Stats</div>
                                <div class="field-value e-meta" style="font-size: 0.85rem;"></div>
                            </div>
                            
                            <div class="field" style="margin-top: 8px;">
                                <div class="field-name">Active Buffs</div>
                                <div class="field-value e-buffs" style="column-count: 2; column-gap: 16px; font-size: 0.8rem; line-height: 1.4;"></div>
                            </div>
                        </div>

                        <div class="field hp-field-container" style="margin-bottom: 8px;">
                            <div class="field-value e-hp"></div>
                        </div>

                        <div class="field" style="margin-bottom: 10px;">
                            <div class="field-name">Card Breakdown</div>
                            <div class="field-value e-details" style="line-height: 1.4;"></div>
                        </div>

                        <div class="field">
                            <div class="field-name">Total Damage:</div>
                            <div class="field-value e-total-output" style="line-height: 1.4;"></div>
                        </div>
                    </div>

                    <div class="btn-row">
                        <button class="btn btn-first">⏮</button>
                        <button class="btn btn-prev">◀</button>
                        <button class="btn btn-toggle">Show Details</button>
                        <button class="btn btn-next">▶</button>
                        <button class="btn btn-last">⏭</button>
                    </div>
                    
                </div>
            </div>
        `;

    const titleEl = msgDiv.querySelector(".embed-title");
    const subEl = msgDiv.querySelector(".embed-subtitle");
    const metaEl = msgDiv.querySelector(".e-meta");
    const thumbEl = msgDiv.querySelector(".embed-thumbnail");

    const summaryContainer = msgDiv.querySelector(".summary-container");
    const waveContainer = msgDiv.querySelector(".wave-container");
    const detailContainer = msgDiv.querySelector(".detailed-view-container");

    const totalOutputEl = msgDiv.querySelector(".e-total-output");
    const hpEl = msgDiv.querySelector(".e-hp");
    const buffsEl = msgDiv.querySelector(".e-buffs");
    const detailsEl = msgDiv.querySelector(".e-details");

    const btnFirst = msgDiv.querySelector(".btn-first");
    const btnPrev = msgDiv.querySelector(".btn-prev");
    const btnToggle = msgDiv.querySelector(".btn-toggle");
    const btnNext = msgDiv.querySelector(".btn-next");
    const btnLast = msgDiv.querySelector(".btn-last");

    let showingDetails = false;

    const formatMeta = (w) => {
      return (
        `<strong>Lv:</strong> ${w.level} | <strong>NP Level:</strong> ${w.npLevel} | <strong>NP Damage Mod:</strong> ${w.npDamageMod}%<br>` +
        `<strong>ATK:</strong> ${Math.floor(w.baseAtk)} | <strong>Fou:</strong> ${w.fou} | <strong>Fou Paw:</strong> ${w.fouPaw} | <strong>CE:</strong> ${w.ce}`
      );
    };

    const renderWave = (index) => {
      const isSummaryPage = isMultiWave && index === 0;

      if (isSummaryPage) {
        summaryContainer.style.display = "block";
        waveContainer.style.display = "none";
        btnToggle.style.display = "inline-block";

        titleEl.innerText = `Calculation Summary: ${waves[0].servantName} [${capitalize(waves[0].servantClass)}]`;
        subEl.innerText = `${waves.length} Waves Overview`;
        thumbEl.src = waves[0].servantLink;

        let summaryHTML = `
            <div class="summary-extra" style="display: ${showingDetails ? "block" : "none"}; padding-bottom: 8px; margin-bottom: 12px; border-bottom: 1px solid #3f4147;">
                <div style="font-size: 0.85rem;">${formatMeta(waves[0])}</div>
            </div>
        `;

        waves.forEach((w, i) => {
          const d = w.data.loopResult;
          const isHpOmitted = d.hpForMinRoll > 1000000000000;

          const hpMinText =
            d.hpForMinRoll > 0
              ? Math.floor(d.hpForMinRoll).toLocaleString()
              : "Dead";
          const hpMaxText =
            d.hpForMaxRoll > 0
              ? Math.floor(d.hpForMaxRoll).toLocaleString()
              : "Dead";

          const hpLeftStr = !isHpOmitted
            ? `<div><strong>HP Left:</strong> (${hpMinText} - ${hpMaxText})</div>`
            : "";
          const successStr = !isHpOmitted
            ? `<div><strong>Success Chance:</strong> ${d.hpForMinRoll <= 0 ? "100" : (d.successProbability * 100).toFixed(3)}%</div>`
            : "";

          const enemyInfoHtml = buildEnemyHtml(w.snapshot);

          summaryHTML += `
                <div class="field" style="margin-bottom: 12px;">
                    <div class="field-name">Wave ${i + 1} • Chain: ${getColoredChain(w.chain)}</div>
                    <div class="field-value" style="line-height: 1.4;">
                        ${enemyInfoHtml}
                        <div style="display: flex; align-items: center; margin-top: 4px;">${getSkillIcon("00301")} <strong>${Math.floor(d.totalAvgDamage).toLocaleString()}</strong>&nbsp;(${Math.floor(d.totalMinDamage).toLocaleString()} - ${Math.floor(d.totalMaxDamage).toLocaleString()})</div>
                        
                        <div class="summary-extra" style="display: ${showingDetails ? "block" : "none"}; margin-top: 4px; margin-bottom: 4px;">
                            <div style="display: flex; align-items: center;">${getSkillIcon("00601")} <strong>${(d.totalRefundMinRoll / 100).toFixed(2)}%</strong>&nbsp;<strong>-</strong> &nbsp;<strong>${(d.totalRefundMaxRoll / 100).toFixed(2)}%</strong></div>
                            <div style="display: flex; align-items: center; margin-top: 2px;">${getSkillIcon("00603")} <strong>[${d.totalStarGenMinRollLowChance}</strong>&nbsp;-&nbsp;<strong>${d.totalStarGenMinRollHighChance}]</strong>&nbsp;<strong>-</strong>&nbsp;<strong>[${d.totalStarGenMaxRollLowChance}</strong>&nbsp;-&nbsp;<strong>${d.totalStarGenMaxRollHighChance}]</strong></div>
                        </div>
                        
                        ${hpLeftStr}
                        ${successStr}
                    </div>
                </div>
            `;
        });
        summaryContainer.innerHTML = summaryHTML;
      } else {
        summaryContainer.style.display = "none";
        waveContainer.style.display = "block";
        btnToggle.style.display = "inline-block";

        const waveIndex = isMultiWave ? index - 1 : index;
        const wave = waves[waveIndex];
        const data = wave.data.loopResult;

        titleEl.innerText = `Calculation: ${wave.servantName} [${capitalize(wave.servantClass)}]`;
        subEl.innerHTML = `Wave ${waveIndex + 1} / ${waves.length} • Chain: ${getColoredChain(wave.chain)}`;
        metaEl.innerHTML = formatMeta(wave);
        thumbEl.src = wave.servantLink;

        buffsEl.innerHTML = formatBuffs(wave.snapshot);

        detailsEl.innerHTML = "";
        data.perCardResults.forEach((card) => {
          let cardIconUrl =
            card.cardToken === "A"
              ? "./assets/arts.png"
              : card.cardToken === "B"
                ? "./assets/buster.png"
                : card.cardToken === "Q"
                  ? "./assets/quick.png"
                  : card.cardToken === "NP"
                    ? "./assets/np.png"
                    : "./assets/extra.png";

          let critTag = card.isCrit
            ? `<span style="font-weight: 800; margin-left: 4px;">[CRIT]</span>`
            : "";

          detailsEl.innerHTML += `
            <div style="margin-bottom: 8px;">
                <div style="display: flex; align-items: center; flex-wrap: wrap;">
                    <span style="display: inline-block; width: 24px;"><strong>[${card.position}]</strong></span> 
                    <span style="display: flex; align-items: center; margin-right: 6px;">
                        <img src="${cardIconUrl}" style="width: 16px; height: 16px;" alt="Card">
                    </span>
                    ${critTag}<span style="margin-left: 2px;">: <strong>${Math.floor(card.avgDamage).toLocaleString()}</strong> (${Math.floor(card.minDamage).toLocaleString()} - ${Math.floor(card.maxDamage).toLocaleString()})</span>
                </div>
                
                <div class="summary-extra" style="display: ${showingDetails ? "block" : "none"}; margin-top: 4px;">
                    <div style="display: flex; align-items: center; margin-bottom: 2px; padding-left: 24px;">
                        ${getSkillIcon("00601")} <strong>${card.npGainMinRoll.toFixed(2)}%</strong>&nbsp;[${card.cardOverkillHitsMinRoll} OK] &nbsp;<strong>-</strong> &nbsp;<strong> ${card.npGainMaxRoll.toFixed(2)}%</strong>&nbsp;[${card.cardOverkillHitsMaxRoll} OK]
                    </div>
                    <div style="display: flex; align-items: center; padding-left: 24px;">
                        ${getSkillIcon("00603")} <strong>[${card.starGenMinLowChance}</strong>&nbsp;-&nbsp;<strong>${card.starGenMinHighChance}]</strong>&nbsp;<strong>-</strong>&nbsp;<strong>[${card.starGenMaxLowChance}</strong>&nbsp;-&nbsp;<strong>${card.starGenMaxHighChance}]</strong>
                    </div>
                </div>
            </div>
          `;
        });

        detailContainer.style.display = showingDetails ? "block" : "none";

        hpEl.innerHTML = buildEnemyHtml(wave.snapshot);

        const hpRemainingMin = data.hpForMinRoll;
        const hpRemainingMax = data.hpForMaxRoll;
        const isHpOmitted = hpRemainingMin > 1000000000000;

        const hpMinWaveText =
          hpRemainingMin > 0
            ? Math.floor(hpRemainingMin).toLocaleString()
            : "Dead";
        const hpMaxWaveText =
          hpRemainingMax > 0
            ? Math.floor(hpRemainingMax).toLocaleString()
            : "Dead";

        const dmgStr = `<div style="display: flex; align-items: center; margin-bottom: 4px;">${getSkillIcon("00301")} <strong>${Math.floor(data.totalAvgDamage).toLocaleString()}</strong>&nbsp;(${Math.floor(data.totalMinDamage).toLocaleString()} - ${Math.floor(data.totalMaxDamage).toLocaleString()})</div>`;
        const npStr = `<div style="display: flex; align-items: center; margin-bottom: 4px;">${getSkillIcon("00601")} <strong>${(data.totalRefundMinRoll / 100).toFixed(2)}%</strong>&nbsp;<strong> - </strong>&nbsp;<strong>${(data.totalRefundMaxRoll / 100).toFixed(2)}%</strong></div>`;
        const starStr = `<div style="display: flex; align-items: center; margin-bottom: 4px;">${getSkillIcon("00603")} <strong>[${data.totalStarGenMinRollLowChance}</strong>&nbsp;-&nbsp;<strong>${data.totalStarGenMinRollHighChance}]</strong>&nbsp;<strong>-</strong>&nbsp;<strong>[${data.totalStarGenMaxRollLowChance}</strong>&nbsp;-&nbsp;<strong>${data.totalStarGenMaxRollHighChance}]</strong></div>`;

        let totalOutputHtml = `${dmgStr}${npStr}${starStr}`;

        if (!isHpOmitted) {
          const succChance =
            hpRemainingMin <= 0
              ? "100"
              : (data.successProbability * 100).toFixed(3);
          totalOutputHtml += `<div><strong>HP Left:</strong> (${hpMinWaveText} - ${hpMaxWaveText})</div>`;
          totalOutputHtml += `<div><strong>Success Chance:</strong> ${succChance}%</div>`;
        }

        totalOutputEl.innerHTML = totalOutputHtml;
      }

      if (isMultiWave) {
        const maxPages = waves.length;
        btnFirst.style.display =
          btnPrev.style.display =
          btnNext.style.display =
          btnLast.style.display =
            "inline-block";
        btnFirst.disabled = index === 0;
        btnPrev.disabled = index === 0;
        btnNext.disabled = index === maxPages;
        btnLast.disabled = index === maxPages;
      } else {
        btnFirst.style.display =
          btnPrev.style.display =
          btnNext.style.display =
          btnLast.style.display =
            "none";
      }
    };

    btnToggle.addEventListener("click", () => {
      const prevButtonY = btnToggle.getBoundingClientRect().top;

      showingDetails = !showingDetails;
      btnToggle.innerText = showingDetails ? "Hide Details" : "Show Details";

      if (detailContainer) {
        detailContainer.style.display = showingDetails ? "block" : "none";
      }

      const summaryExtras = msgDiv.querySelectorAll(".summary-extra");
      summaryExtras.forEach((el) => {
        el.style.display = showingDetails ? "block" : "none";
      });

      const newButtonY = btnToggle.getBoundingClientRect().top;
      const chatContainer = document.getElementById("chatContainer");
      chatContainer.scrollTop += (newButtonY - prevButtonY);
    });

    // --- Scroll Anchoring Helper for Wave Navigation ---
    const changeWave = (newIndex, clickedBtn) => {
      const prevY = clickedBtn.getBoundingClientRect().top;

      currentWaveIndex = newIndex;
      renderWave(currentWaveIndex);

      const newY = clickedBtn.getBoundingClientRect().top;
      const chatContainer = document.getElementById("chatContainer");
      chatContainer.scrollTop += (newY - prevY);
    };

    const maxPages = isMultiWave ? waves.length : 0;
    
    btnFirst.addEventListener("click", () => {
      changeWave(0, btnFirst);
    });
    
    btnPrev.addEventListener("click", () => {
      if (currentWaveIndex > 0) changeWave(currentWaveIndex - 1, btnPrev);
    });
    
    btnNext.addEventListener("click", () => {
      if (currentWaveIndex < maxPages) changeWave(currentWaveIndex + 1, btnNext);
    });
    
    btnLast.addEventListener("click", () => {
      changeWave(maxPages, btnLast);
    });

    renderWave(currentWaveIndex);
    chatContainer.appendChild(msgDiv);
    scrollToBottom();
    
    if (save) {
      history.push({type: "embed", waves, time: msgTime});
      saveState();
    }
  }
});