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
    let text = "The reactor hums back to life. Vault 5 is saved.\n\n";
    const culpritIdentified = gameState.flags.culpritIdentified || false;
    const culpritCorrect    = gameState.flags.culpritCorrect    || false;
    const sentence          = gameState.flags.sentence;

    if (!culpritIdentified) {
        text += "But the saboteur remains at large, hidden among the dwellers. Trust is broken, and paranoia festers in the corridors like a disease nobody wants to name. The Overseer thanks you with a hollow smile \u2013 she knows, as you do, that the real threat still watches from the shadows. Meals are eaten in silence. Neighbors eye each other over the hydroponic soy. The water chip works again, but nobody trusts the water.\n\n";
        text += "You lie awake at night, staring at the riveted ceiling, wondering which face hides the knife. Marcus is still there, still smiling that too\u2011wide smile. You have no proof, only instinct. And instinct, in Vault\u2011Tec\u2019s world, is worth less than the lint in your pocket.\n\n";
        text += "The vault survives. But survival isn\u2019t the same as living. You saved them from the reactor, but you couldn\u2019t save them from themselves. Some victories taste like ash.\n\n";
    } else if (culpritCorrect) {
        text += "You have unmasked the true traitor: Marcus, the Overseer\u2019s assistant. The evidence is undeniable \u2013 a holotape, a terminal log, a confession that spills out like rancid oil. The dwellers gasp. Security cuffs him. His smile finally cracks, revealing the rot beneath.\n\n";
        text += "\u2018Vault\u2011Tec promised me a place in a control vault,\u2019 he snarls. \u2018They said I\u2019d be safe. I was just following orders.\u2019 The words hang in the recycled air, heavy and pathetic. Following orders. The oldest excuse for the worst crimes.\n\n";

        if (sentence === "mercy") {
            text += "You show mercy. Marcus is imprisoned in the vault\u2019s brig \u2013 a converted storage closet with a cot and a bucket. He\u2019ll spend his days scrubbing pipes and repairing filtration units. Some call you weak. They whisper that you should have put a bullet in his head. But others see wisdom in redemption \u2013 or maybe they\u2019re just tired of blood.\n\n";
            text += "Marcus works in silence. He doesn\u2019t thank you. He doesn\u2019t curse you. He just exists, a ghost in a jumpsuit. The vault breathes easier, but the scar remains. You pass him in the corridor sometimes. He looks away. So do you.\n\n";
        } else if (sentence === "exile") {
            text += "You cast Marcus into the wasteland without a weapon, without a canteen, without hope. The vault door seals behind him. His last look is not anger, but something worse: resignation. He knew this was coming. He always knew.\n\n";
            text += "The dwellers cheer. Justice, they call it. But you can\u2019t shake the image of him walking into the dust, alone, under a sky the color of a healing bruise. He won\u2019t survive the night. The radscorpions will see to that.\n\n";
            text += "The vault is safe. But safety built on exile feels like a bandage on a wound that needs stitches. You tell yourself he deserved it. Most nights, you almost believe it.\n\n";
        } else if (sentence === "execution") {
            text += "Marcus is executed by firing squad in the atrium. The plastic tree watches, its leaves dusted for the occasion. The shots echo off the metal walls \u2013 three sharp cracks, then silence. His body crumples, a red stain spreading on the concrete.\n\n";
            text += "His last words are a curse \u2013 not on you, but on Vault\u2011Tec, on the world, on the whole rotten system that made him a pawn. The dwellers turn away, suddenly ashamed. Nobody cheers. Nobody cries. They just\u2026 leave.\n\n";
            text += "You stand alone with the body, the regulator still warm in your hands. Order is restored. Fear is replaced by something colder. The vault is safe. But you wonder, sometimes, if you executed the wrong person after all. Not Marcus \u2013 yourself.\n\n";
        }
    } else {
        text += "You accuse an innocent dweller based on flimsy evidence \u2013 a hunch, a whisper, a desperate need to blame someone. The council listens. The dwellers shout for blood. And you give it to them.\n\n";
        text += "The real saboteur remains hidden, maybe laughing, maybe watching from the shadows. The vault\u2019s unity crumbles like old concrete. Your reputation \u2013 once a hero\u2019s \u2013 shatters into a thousand pieces. People avoid you in the corridors. They whisper behind your back. \u2018Wrong man,\u2019 they say. \u2018Finger pointed the wrong way.\u2019\n\n";

        if (sentence === "mercy") {
            text += "You show mercy to the innocent. He is imprisoned \u2013 not in the brig, but in a corner of the hydroponics bay, under guard. He doesn\u2019t speak. He doesn\u2019t eat. He just sits, staring at the plastic tree, his eyes empty.\n\n";
            text += "The whispers follow you forever. \u2018She let him live,\u2019 they say, \u2018but she killed his soul.\u2019 You visit him once. He looks through you like you\u2019re made of glass. You never go back.\n\n";
            text += "The vault endures, but it\u2019s a hollow shell. Trust is a currency nobody spends. And you, the hero of Vault 5, are its most indebted citizen.\n\n";
        } else if (sentence === "exile") {
            text += "You cast an innocent family into the wasteland \u2013 a father, a mother, a child no older than five. The vault door seals behind them. The mother\u2019s eyes haunt you. The child\u2019s silence is louder than any scream.\n\n";
            text += "You will never forget their faces. They stare at you in your dreams, asking why. You have no answer. Only the hollow echo of your own voice, shouting \u2018traitor\u2019 at the wrong target.\n\n";
            text += "The wasteland outside is harsh. They won\u2019t last a week. And when they\u2019re gone, you\u2019ll still be here, living with the weight of their exile. Justice? No. Just tragedy wearing a hero\u2019s badge.\n\n";
        } else if (sentence === "execution") {
            text += "Blood stains the atrium floor. You executed the wrong person. The innocent\u2019s last words were not a curse, but a question: \u2018Why?\u2019 You have no answer. The bullet left your gun, but the guilt never leaves you.\n\n";
            text += "The dwellers turn away. The Overseer avoids your gaze. Even the security guards shuffle their feet, uncomfortable. You wanted justice. You got murder.\n\n";
            text += "The vault is safe \u2013 the reactor hums, the water flows \u2013 but the safety is built on a lie. You go to sleep each night and wake each morning to the same thought: an innocent person died because you were too eager, too angry, too blind.\n\n";
            text += "Some heroes get statues. You get a stain that won\u2019t wash out.\n\n";
        }
    }

    text += "The wasteland outside remains harsh \u2013 the sun still burns, the radscorpions still skitter, the Enclave still schemes. But for now, Vault 5 endures. The lights stay on. The children grow up. The old die slow.\n\n";
    text += "Your adventure is over. But the wasteland never stops. And somewhere, out there, a regulator waits for the next vault to fail.\n\n";
    text += "Thank you for playing.\n\n";
    text += "\u2014 Vault 5 \u2014";

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