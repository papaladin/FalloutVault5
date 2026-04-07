// game.js

// ------------------- Configuration -------------------
const ENABLE_IMAGES = true;  // Set to false if you have no images in /assets/

// Fix #5: centralise all magic numbers — change here, everything updates
const CONFIG = {
    STARTING_DAYS:    15,
    BASE_SPECIAL:     5,
    CREATION_POINTS:  5,
    MAX_SPECIAL:      10,
    HP_PER_ENDURANCE: 2,
    START_NODE:       "vault_start",
};

// ------------------- Global Data -------------------
let storyData = {};           // loaded from story.json
let textMap   = {};           // loaded from detailed_story.json

// ------------------- Helper: format text with paragraphs and line breaks -------------------
function formatStoryText(text) {
    if (!text) return "";
    const paragraphs = text.split(/\n\s*\n/);
    return paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

// ------------------- Playlist (add more URLs here) -------------------
const playlist = [
    "https://archive.org/download/fallout_2_soundtrack/07%20Industrial%20Junk.mp3",
    "https://archive.org/download/fallout_2_soundtrack/08%20Underground%20Troubles.mp3",
    "https://archive.org/download/fallout_2_soundtrack/09%20City%20Of%20The%20Dead.mp3"
];
let currentTrack = 0;
let audioPlayer  = null;

// ------------------- Initial State -------------------
let gameState = {
    currentNodeId: CONFIG.START_NODE,
    hp:       CONFIG.BASE_SPECIAL * CONFIG.HP_PER_ENDURANCE,
    maxHp:    CONFIG.BASE_SPECIAL * CONFIG.HP_PER_ENDURANCE,
    daysLeft: CONFIG.STARTING_DAYS,
    flags:    {},
    special: {
        strength:     CONFIG.BASE_SPECIAL,
        perception:   CONFIG.BASE_SPECIAL,
        endurance:    CONFIG.BASE_SPECIAL,
        charisma:     CONFIG.BASE_SPECIAL,
        intelligence: CONFIG.BASE_SPECIAL,
        agility:      CONFIG.BASE_SPECIAL,
        luck:         CONFIG.BASE_SPECIAL,
    }
};

// ------------------- Helper Functions -------------------
function updateStatsDisplay() {
    document.getElementById("hp-value").innerText     = gameState.hp;
    document.getElementById("max-hp-value").innerText = gameState.maxHp;
    document.getElementById("days-value").innerText   = gameState.daysLeft;
    document.getElementById("clues-value").innerText  = gameState.flags.cluesFound || 0;
    document.getElementById("str").innerText = gameState.special.strength;
    document.getElementById("per").innerText = gameState.special.perception;
    document.getElementById("end").innerText = gameState.special.endurance;
    document.getElementById("cha").innerText = gameState.special.charisma;
    document.getElementById("int").innerText = gameState.special.intelligence;
    document.getElementById("agi").innerText = gameState.special.agility;
    document.getElementById("luk").innerText = gameState.special.luck;
}

function saveGame() {
    const saveData = {
        currentNodeId: gameState.currentNodeId,
        hp:       gameState.hp,
        maxHp:    gameState.maxHp,
        daysLeft: gameState.daysLeft,
        flags:    gameState.flags,
        special:  { ...gameState.special }
    };
    localStorage.setItem("vault5_save", JSON.stringify(saveData));
}

function loadGame() {
    const saved = localStorage.getItem("vault5_save");
    if (!saved) return false;
    try {
        const data = JSON.parse(saved);
        gameState.currentNodeId = data.currentNodeId;
        gameState.hp       = data.hp;
        gameState.maxHp    = data.maxHp;
        gameState.daysLeft = data.daysLeft;
        gameState.flags    = data.flags || {};
        // Fix #8 (bonus): guard against saves from older versions missing a key
        gameState.special = Object.assign(
            {
                strength: CONFIG.BASE_SPECIAL, perception:   CONFIG.BASE_SPECIAL,
                endurance: CONFIG.BASE_SPECIAL, charisma:    CONFIG.BASE_SPECIAL,
                intelligence: CONFIG.BASE_SPECIAL, agility:  CONFIG.BASE_SPECIAL,
                luck: CONFIG.BASE_SPECIAL,
            },
            data.special
        );
        updateStatsDisplay();
        return true;
    } catch(e) {
        console.error("Failed to load save:", e);
        return false;
    }
}

function clearSave() {
    localStorage.removeItem("vault5_save");
}

function resetGame() {
    clearSave();
    // Fix #5: all constants come from CONFIG
    gameState.special = {
        strength:     CONFIG.BASE_SPECIAL,
        perception:   CONFIG.BASE_SPECIAL,
        endurance:    CONFIG.BASE_SPECIAL,
        charisma:     CONFIG.BASE_SPECIAL,
        intelligence: CONFIG.BASE_SPECIAL,
        agility:      CONFIG.BASE_SPECIAL,
        luck:         CONFIG.BASE_SPECIAL,
    };
    gameState.maxHp    = CONFIG.HP_PER_ENDURANCE * gameState.special.endurance;
    gameState.hp       = gameState.maxHp;
    gameState.daysLeft = CONFIG.STARTING_DAYS;
    gameState.flags    = {};
    gameState.currentNodeId = CONFIG.START_NODE;
    updateStatsDisplay();
    showCreationScreen();
}

// Fix #6: single shared helper — both "add_clue" and "adjust" actions call this
function addClue(clueId) {
    gameState.flags.cluesFound = (gameState.flags.cluesFound || 0) + 1;
    gameState.flags[`clue_${clueId}`] = true;
    if (gameState.flags.cluesFound === 1) {
        gameState.flags.has_any_clue = true;
    }
}

// Fix #1: HP cap guard only applies when base delta is negative (damage).
//         Healing nodes that also carry hpModifiers are no longer zeroed out.
//         Bonus: three-line clamp replaced by one Math.min/max call.
function applyNodeEffects(node) {
    let hpDelta = node.hpChange || 0;
    if (hpDelta < 0 && node.hpModifiers && Array.isArray(node.hpModifiers)) {
        for (const mod of node.hpModifiers) {
            if (gameState.special[mod.stat] >= mod.min) {
                hpDelta += mod.reduction;
            }
        }
        if (hpDelta > 0) hpDelta = 0;  // mitigation can neutralise damage, never flip to healing
    }
    gameState.hp = Math.min(gameState.maxHp, Math.max(0, gameState.hp + hpDelta));
    if (node.daysCost) gameState.daysLeft -= node.daysCost;
    updateStatsDisplay();
    saveGame();
}

function checkAndHandleGameOver() {
    if (gameState.hp <= 0) {
        displayGameOverNode("game_over_death");
        return true;
    }
    if (gameState.daysLeft <= 0) {
        displayGameOverNode("game_over_time");
        return true;
    }
    return false;
}

// Fix #3: built-in fallback text when game-over node is missing from story.json
function displayGameOverNode(nodeId) {
    const node = storyData[nodeId];
    const fallbackText = nodeId === "game_over_death"
        ? "You have died. The wasteland claims another soul."
        : "Time has run out. The vault could not be saved.";

    const displayText = node
        ? (node.contentKey && textMap[node.contentKey] ? textMap[node.contentKey] : node.content)
        : fallbackText;

    document.getElementById("story-content").innerHTML = formatStoryText(displayText);
    const choicesDiv = document.getElementById("choices-container");
    choicesDiv.innerHTML = "";
    const restartBtn = document.createElement("button");
    restartBtn.innerText = "Restart";
    restartBtn.classList.add("choice-btn");
    restartBtn.onclick = () => resetGame();
    choicesDiv.appendChild(restartBtn);
    document.getElementById("rest-button-container").innerHTML = "";
    clearSave();
}

function generateEpilogue() {
    let text = textMap["epilogue_intro"] || "The reactor hums back to life. Vault 5 is saved.\n\n";
    const culpritIdentified = gameState.flags.culpritIdentified || false;
    const culpritCorrect    = gameState.flags.culpritCorrect    || false;
    const sentence          = gameState.flags.sentence;

    if (!culpritIdentified) {
        text += textMap["epilogue_culprit_not_identified"] || "";
    } else if (culpritCorrect) {
        text += textMap["epilogue_culprit_correct_intro"] || "";
        if (sentence === "mercy") {
            text += textMap["epilogue_culprit_correct_mercy"] || "";
        } else if (sentence === "exile") {
            text += textMap["epilogue_culprit_correct_exile"] || "";
        } else if (sentence === "execution") {
            text += textMap["epilogue_culprit_correct_execution"] || "";
        }
    } else {
        text += textMap["epilogue_culprit_wrong_intro"] || "";
        if (sentence === "mercy") {
            text += textMap["epilogue_culprit_wrong_mercy"] || "";
        } else if (sentence === "exile") {
            text += textMap["epilogue_culprit_wrong_exile"] || "";
        } else if (sentence === "execution") {
            text += textMap["epilogue_culprit_wrong_execution"] || "";
        }
    }

    text += textMap["epilogue_outro"] || "";
    return text;
}

// ------------------- Music -------------------
// Fix #9: updateMusicButtonState uses the audioPlayer variable consistently
function toggleMusic() {
    if (!audioPlayer) return;
    if (audioPlayer.paused) {
        audioPlayer.play().catch(e => console.error("Playback error:", e));
    } else {
        audioPlayer.pause();
    }
    // Button label is updated by the "play"/"pause" event listeners set in initPlaylist
}

function updateMusicButtonState() {
    const btn = document.getElementById("toggle-music-btn");
    if (!audioPlayer || !btn) return;
    btn.innerHTML = audioPlayer.paused ? "\uD83C\uDFB5 Play Music" : "\uD83C\uDFB5 Stop Music";
}

function initPlaylist() {
    audioPlayer = document.getElementById("bg-music");
    if (!audioPlayer || playlist.length === 0) return;
    audioPlayer.src = playlist[0];
    audioPlayer.addEventListener("ended", () => {
        currentTrack = (currentTrack + 1) % playlist.length;
        audioPlayer.src = playlist[currentTrack];
        audioPlayer.play().catch(e => console.log("Playback error:", e));
    });
    audioPlayer.addEventListener("play",  updateMusicButtonState);
    audioPlayer.addEventListener("pause", updateMusicButtonState);
}

function startMusic() {
    if (audioPlayer && audioPlayer.paused) {
        audioPlayer.play().catch(e => console.log("Autoplay blocked:", e));
    }
}

// ------------------- Core Node Loading -------------------
function loadNode(nodeId) {
    window.scrollTo(0, 0);

    if (nodeId === "RESTART") {
        resetGame();
        return;
    }

    const node = storyData[nodeId];
    if (!node) {
        console.error("Node not found:", nodeId);
        document.getElementById("story-content").innerHTML =
            formatStoryText(`Error: Node "${nodeId}" not found in story.json. Check file syntax and node IDs.`);
        return;
    }

    // Logic node: determine_culprit
    if (node.isLogicNode) {
        const clues = gameState.flags.cluesFound || 0;
        if (clues === 0) {
            gameState.flags.culpritIdentified = false;
            gameState.flags.culpritCorrect    = false;
            gameState.currentNodeId = "epilogue";
            loadNode("epilogue");
            return;
        }
        const culpritCorrect = clues >= 2 ? true : Math.random() < 0.5;
        gameState.flags.culpritIdentified = true;
        gameState.flags.culpritCorrect    = culpritCorrect;
        gameState.currentNodeId = culpritCorrect ? "sentencing" : "epilogue";
        loadNode(gameState.currentNodeId);
        return;
    }

    // Apply node-level effects and check for game over
    applyNodeEffects(node);
    if (checkAndHandleGameOver()) return;

    // Dynamic epilogue
    if (node.isDynamic && node.id === "epilogue") {
        document.getElementById("story-content").innerHTML     = formatStoryText(generateEpilogue());
        document.getElementById("choices-container").innerHTML     = "";
        document.getElementById("rest-button-container").innerHTML = "";
        document.getElementById("node-image").style.display        = "none";
        return;
    }

    // Resolve display text: detailed prose > fallback summary
    const displayText = (node.contentKey && textMap[node.contentKey])
        ? textMap[node.contentKey]
        : node.content;
    document.getElementById("story-content").innerHTML = formatStoryText(displayText);

    // Image handling
    const imgElement = document.getElementById("node-image");
    if (ENABLE_IMAGES) {
        const imageName = node.imageKey || node.id;
        imgElement.src = `assets/${imageName}.jpg`;
        imgElement.onload  = () => { imgElement.style.display = "block"; };
        imgElement.onerror = () => {
            imgElement.src = "assets/default.jpg";
            imgElement.onerror = () => {
                imgElement.style.display = "none";
                imgElement.src = "";
            };
        };
    } else {
        imgElement.style.display = "none";
        imgElement.src = "";
    }

    // Choices
    const choicesDiv = document.getElementById("choices-container");
    choicesDiv.innerHTML = "";

    // Fix #2: guard against nodes with no choices array (terminal or stub nodes)
    (node.choices || []).forEach(choice => {

        if (!evaluateCondition(choice.condition)) return;

        const btn = document.createElement("button");
        btn.innerText = choice.text;
        btn.classList.add("choice-btn");
        btn.onclick = () => {
            const shouldStay = applyChoiceAction(choice);

            const extraText = (choice.extraContentKey && textMap[choice.extraContentKey])
                ? textMap[choice.extraContentKey]
                : (choice.extra_content || "");

            if (extraText && !shouldStay) {
                document.getElementById("story-content").innerHTML =
                    formatStoryText(displayText + "\n\n" + extraText);
                choicesDiv.innerHTML = "";
                document.getElementById("rest-button-container").innerHTML = "";
                const continueBtn = document.createElement("button");
                continueBtn.innerText = "Continue";
                continueBtn.classList.add("choice-btn");
                continueBtn.onclick = () => {
                    gameState.currentNodeId = choice.target;
                    loadNode(choice.target);
                };
                choicesDiv.appendChild(continueBtn);
            } else if (shouldStay) {
                loadNode(nodeId);
            } else {
                gameState.currentNodeId = choice.target;
                loadNode(choice.target);
            }
        };
        choicesDiv.appendChild(btn);
    });

    // Fix #4: rest hub is now data-driven via "isRestHub": true in story.json.
    //         Optional "restHpGain" and "restDayCost" fields override the defaults.
    const restContainer = document.getElementById("rest-button-container");
    restContainer.innerHTML = "";
    if (node.isRestHub) {
        const hpGain  = node.restHpGain  ?? 2;
        const dayCost = node.restDayCost ?? 2;
        const restBtn = document.createElement("button");
        restBtn.innerText = `Rest (+${hpGain} HP, -${dayCost} days)`;
        restBtn.classList.add("rest-btn");
        restBtn.onclick = () => {
            gameState.hp = Math.min(gameState.maxHp, gameState.hp + hpGain);
            gameState.daysLeft -= dayCost;
            updateStatsDisplay();
            saveGame();
            if (checkAndHandleGameOver()) return;
            loadNode(nodeId);
        };
        restContainer.appendChild(restBtn);
    }
}

// ------------------- Condition Evaluator -------------------
// Extracted from the inline forEach so it can be read and extended independently.
function evaluateCondition(condition) {
    if (!condition) return true;

    if (condition.startsWith("hasFlag:")) {
        return !!gameState.flags[condition.substring(8)];
    }
    if (condition.startsWith("notHasFlag:")) {
        return !gameState.flags[condition.substring(11)];
    }
    if (condition.includes(" or ")) {
        return condition.split(" or ").some(part => evalStatCondition(part.trim()));
    }
    return evalStatCondition(condition);
}

function evalStatCondition(expr) {
    const parts = expr.split(/\s+/);
    if (parts.length !== 3) return true;  // malformed → show the choice rather than silently hide it
    const [stat, op, valStr] = parts;
    const val      = parseInt(valStr, 10);
    const statValue = gameState.special[stat];
    if (isNaN(val) || statValue === undefined) return true;
    if (op === ">=") return statValue >= val;
    if (op === "<=") return statValue <= val;
    if (op === ">")  return statValue >  val;
    if (op === "<")  return statValue <  val;
    if (op === "==") return statValue === val;
    return true;
}

// ------------------- Choice Action Handler -------------------
// Returns true if the node should reload in place (rest / train), false to navigate away.
function applyChoiceAction(choice) {
    const sel = choice.on_select;
    if (!sel) return false;

    switch (sel.action) {

        case "add_clue":
            // Fix #6: delegates to shared addClue() helper
            addClue(sel.clue_id);
            saveGame();
            return false;

        case "set_flag":
            gameState.flags[sel.flag] = sel.value;
            saveGame();
            return false;

        case "set_sentence":
            gameState.flags.sentence = sel.sentence;
            saveGame();
            return false;

        case "rest":
            gameState.hp = Math.min(gameState.maxHp, gameState.hp + sel.hpGain);
            gameState.daysLeft -= sel.daysCost;
            updateStatsDisplay();
            saveGame();
            return true;    // stay on current node

        case "train":
            gameState.special[sel.stat1] += 1;
            gameState.special[sel.stat2] += 1;
            gameState.daysLeft -= sel.daysCost;
            updateStatsDisplay();
            saveGame();
            return true;    // stay on current node

        case "adjust":
            if (sel.hp)         gameState.hp = Math.min(gameState.maxHp, Math.max(0, gameState.hp + sel.hp));
            if (sel.days)       gameState.daysLeft += sel.days;
            // Fix #6: delegates to shared addClue() helper
            if (sel.clue)       addClue(sel.clue);
            if (sel.stat_bonus) gameState.special[sel.stat_bonus] += sel.stat_bonus_value;
            if (sel.set_flag)   gameState.flags[sel.set_flag] = true;
            updateStatsDisplay();
            saveGame();
            return false;

        default:
            console.warn("Unknown on_select action:", sel.action);
            return false;
    }
}

// ------------------- Character Creation Logic -------------------
let creationPoints = CONFIG.CREATION_POINTS;
let creationStats  = {
    strength:     CONFIG.BASE_SPECIAL,
    perception:   CONFIG.BASE_SPECIAL,
    endurance:    CONFIG.BASE_SPECIAL,
    charisma:     CONFIG.BASE_SPECIAL,
    intelligence: CONFIG.BASE_SPECIAL,
    agility:      CONFIG.BASE_SPECIAL,
    luck:         CONFIG.BASE_SPECIAL,
};

function updateCreationUI() {
    document.getElementById("create-str").innerText = creationStats.strength;
    document.getElementById("create-per").innerText = creationStats.perception;
    document.getElementById("create-end").innerText = creationStats.endurance;
    document.getElementById("create-cha").innerText = creationStats.charisma;
    document.getElementById("create-int").innerText = creationStats.intelligence;
    document.getElementById("create-agi").innerText = creationStats.agility;
    document.getElementById("create-luk").innerText = creationStats.luck;
    document.getElementById("points-remaining").innerText = creationPoints;
}

// Fix #8: enforce upper bound via CONFIG.MAX_SPECIAL.
//         Bonus: the two identical branches simplified to one line.
function modifyStat(stat, delta) {
    const newVal = creationStats[stat] + delta;
    if (newVal < 1 || newVal > CONFIG.MAX_SPECIAL) return;
    if (delta === 1 && creationPoints <= 0) return;
    creationStats[stat] = newVal;
    creationPoints -= delta;    // +1 raises stat → costs a point; -1 lowers → refunds a point
    updateCreationUI();
}

function confirmCreation() {
    // Fix #5: use CONFIG constants
    gameState.special   = { ...creationStats };
    gameState.maxHp     = CONFIG.HP_PER_ENDURANCE * gameState.special.endurance;
    gameState.hp        = gameState.maxHp;
    gameState.daysLeft  = CONFIG.STARTING_DAYS;
    gameState.flags     = {};
    gameState.currentNodeId = CONFIG.START_NODE;
    updateStatsDisplay();
    document.getElementById("creation-modal").style.display = "none";
    clearSave();
    saveGame();
    loadNode(CONFIG.START_NODE);
    startMusic();
}

function showCreationScreen() {
    // Fix #5: use CONFIG constants
    creationPoints = CONFIG.CREATION_POINTS;
    creationStats  = {
        strength:     CONFIG.BASE_SPECIAL,
        perception:   CONFIG.BASE_SPECIAL,
        endurance:    CONFIG.BASE_SPECIAL,
        charisma:     CONFIG.BASE_SPECIAL,
        intelligence: CONFIG.BASE_SPECIAL,
        agility:      CONFIG.BASE_SPECIAL,
        luck:         CONFIG.BASE_SPECIAL,
    };
    updateCreationUI();
    document.getElementById("creation-modal").style.display    = "flex";
    document.getElementById("story-content").innerHTML         = "";
    document.getElementById("choices-container").innerHTML     = "";
    document.getElementById("rest-button-container").innerHTML = "";
    document.getElementById("node-image").style.display        = "none";
}

// ------------------- Restart Button -------------------
function attachRestartButton() {
    const btn = document.getElementById("restart-story-btn");
    if (btn) btn.onclick = () => resetGame();
}

// ------------------- Load JSON Files -------------------
// Fix #7: both files fetched in parallel with Promise.all; sequential callbacks removed
async function loadAllData() {
    const [storyRes, textRes] = await Promise.all([
        fetch("story.json"),
        fetch("detailed_story.json")
    ]);

    if (!storyRes.ok) throw new Error(`story.json: HTTP ${storyRes.status}`);
    storyData = await storyRes.json();

    // detailed_story.json is optional — fall back to empty map if missing
    if (textRes.ok) {
        textMap = await textRes.json();
    } else {
        console.warn("detailed_story.json not found — using fallback node.content summaries.");
        textMap = {};
    }

    console.log(`Loaded ${Object.keys(storyData).length} nodes, ${Object.keys(textMap).length} text keys.`);
}

// ------------------- Initialization -------------------
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("story-content").innerHTML         = formatStoryText("Loading wasteland tales\u2026");
    document.getElementById("choices-container").innerHTML     = "";
    document.getElementById("rest-button-container").innerHTML = "";
    document.getElementById("node-image").style.display        = "none";

    initPlaylist();

    loadAllData()
        .then(() => {
            document.getElementById("special-creator").addEventListener("click", (e) => {
                const btn = e.target.closest("button");
                if (!btn) return;
                const stat = btn.getAttribute("data-stat");
                const dir  = btn.getAttribute("data-dir");
                if (stat && dir) modifyStat(stat, dir === "up" ? 1 : -1);
            });
            document.getElementById("confirm-creation").addEventListener("click", confirmCreation);
            attachRestartButton();

            const musicBtn = document.getElementById("toggle-music-btn");
            if (musicBtn) musicBtn.onclick = toggleMusic;
            updateMusicButtonState();

            const hasSave = loadGame();
            if (hasSave && gameState.currentNodeId && storyData[gameState.currentNodeId]) {
                document.getElementById("creation-modal").style.display = "none";
                loadNode(gameState.currentNodeId);
            } else {
                showCreationScreen();
            }
        })
        .catch(err => {
            console.error("Failed to load story data:", err);
            document.getElementById("story-content").innerHTML =
                formatStoryText(
                    `Failed to load story data: ${err.message}\n\n` +
                    `Make sure you are running the game through a local HTTP server (not file://).`
                );
        });
});