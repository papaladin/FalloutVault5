// game.js

// ------------------- Configuration -------------------
const ENABLE_IMAGES = false;  // Set to true once you have images in /assets/

// ------------------- Global Text Map (from JSON) -------------------
let textMap = {};

// ------------------- Helper: format text with paragraphs and line breaks -------------------
function formatStoryText(text) {
    if (!text) return "";
    let paragraphs = text.split(/\n\s*\n/);
    let formatted = paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    return formatted;
}

// ------------------- Playlist (add more URLs here) -------------------
const playlist = [
    "https://archive.org/download/fallout_2_soundtrack/07%20Industrial%20Junk.mp3",
    "https://archive.org/download/fallout_2_soundtrack/04%20The%20Vault%20of%20the%20Future.mp3"
];
let currentTrack = 0;
let audioPlayer = null;

// ------------------- Initial State -------------------
let gameState = {
    currentNodeId: "vault_start",
    hp: 10,
    maxHp: 10,
    daysLeft: 15,
    flags: {},
    special: {
        strength: 5,
        perception: 5,
        endurance: 5,
        charisma: 5,
        intelligence: 5,
        agility: 5,
        luck: 5
    }
};

// ------------------- Story Data (with contentKey and imageKey) -------------------
const storyData = {
    // I. Vault
    "vault_start": {
        id: "vault_start",
        content: "[vault_start] You wake up in your quarters. A message from the Overseer awaits.",
        contentKey: "vault_start_text",
        imageKey: "vault_start",
        daysCost: 0,
        hpChange: 0,
        choices: [{ text: "Go to the Overseer's office", target: "overseer_office" }]
    },
    "overseer_office": {
        id: "overseer_office",
        content: "[overseer_office] The Overseer gives you the mission. You accept.",
        contentKey: "overseer_office_text",
        imageKey: "overseer_office",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { text: "Accept the mission", target: "vault_atrium" },
            { 
                text: "[Perception ≥ 6] Ask about the sabotage", 
                target: "vault_atrium", 
                condition: "perception >= 6",
                extra_content: "You notice a file on her terminal. She admits the assistant may be involved.",
                extraContentKey: "overseer_office_choice_1_extra",
                on_select: { action: "add_clue", clue_id: 1 }
            }
        ]
    },
    "vault_atrium": {
        id: "vault_atrium",
        content: "[vault_atrium] You say goodbye to the dwellers and head to the exit.",
        contentKey: "vault_atrium_text",
        imageKey: "vault_atrium",
        daysCost: 0,
        hpChange: 0,
        choices: [{ text: "Leave the vault", target: "vault_exit" }]
    },
    "vault_exit": {
        id: "vault_exit",
        content: "[vault_exit] The vault door opens. Radiation stings your skin. (HP -1, Endurance ≥ 6 negates)",
        contentKey: "vault_exit_text",
        imageKey: "vault_exit",
        daysCost: 0,
        hpChange: -1,
        hpModifiers: [
            { stat: "endurance", min: 6, reduction: 1 }
        ],
        choices: [{ text: "Step into the wasteland", target: "road_1" }]
    },
    // II. First Hub
    "road_1": {
        id: "road_1",
        content: "[road_1] A ruined highway. Several paths lead away.",
        contentKey: "road_1_text",
        imageKey: "road_1",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { text: "Approach the NCR checkpoint", target: "ncr_checkpoint" },
            { text: "Investigate the Brotherhood scout", target: "brotherhood_scout" },
            { text: "Visit the ghoul hermit", target: "ghoul_hermit" },
            { text: "Take the radscorpion trench", target: "radscorpion_trench" }
        ]
    },
    "ncr_checkpoint": {
        id: "ncr_checkpoint",
        content: "[ncr_checkpoint] NCR soldiers ask for help with raiders.",
        contentKey: "ncr_checkpoint_text",
        imageKey: "ncr_checkpoint",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { text: "Help them", target: "ncr_raid_fight" },
            { text: "Refuse and move on", target: "wasteland_junction" }
        ]
    },
    "ncr_raid_fight": {
        id: "ncr_raid_fight",
        content: "[ncr_raid_fight] You fight raiders alongside the NCR. (HP -3, Agility ≥ 6 reduces to -1)",
        contentKey: "ncr_raid_fight_text",
        imageKey: "ncr_raid_fight",
        daysCost: 1,
        hpChange: -3,
        hpModifiers: [
            { stat: "agility", min: 6, reduction: 2 }
        ],
        choices: [{ text: "Continue", target: "wasteland_junction" }]
    },
    "brotherhood_scout": {
        id: "brotherhood_scout",
        content: "[brotherhood_scout] A Brotherhood scribe needs help with a robot.",
        contentKey: "brotherhood_scout_text",
        imageKey: "brotherhood_scout",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { text: "Help", target: "brotherhood_patrol_base" },
            { text: "Ignore", target: "wasteland_junction" }
        ]
    },
    "brotherhood_patrol_base": {
        id: "brotherhood_patrol_base",
        content: "[brotherhood_patrol_base] Small Brotherhood camp. They offer a quest.",
        contentKey: "brotherhood_patrol_base_text",
        imageKey: "brotherhood_patrol_base",
        daysCost: 1,
        hpChange: 0,
        choices: [
            { text: "Accept quest", target: "wasteland_junction" },
            { text: "Decline", target: "wasteland_junction" }
        ]
    },
    "ghoul_hermit": {
        id: "ghoul_hermit",
        content: "[ghoul_hermit] A ghoul hermit wants you to clear a bloatfly nest.",
        contentKey: "ghoul_hermit_text",
        imageKey: "ghoul_hermit",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { text: "Clear the nest", target: "bloatfly_nest" },
            { text: "Refuse", target: "wasteland_junction" }
        ]
    },
    "bloatfly_nest": {
        id: "bloatfly_nest",
        content: "[bloatfly_nest] You fight bloatflies. (HP -2, Perception ≥ 6 reduces to -1)",
        contentKey: "bloatfly_nest_text",
        imageKey: "bloatfly_nest",
        daysCost: 1,
        hpChange: -2,
        hpModifiers: [
            { stat: "perception", min: 6, reduction: 1 }
        ],
        choices: [{ text: "Return to hermit", target: "wasteland_junction" }]
    },
    "radscorpion_trench": {
        id: "radscorpion_trench",
        content: "[radscorpion_trench] You face radscorpions. (HP -3, Agility ≥ 6 reduces to -1, Strength ≥ 7 negates)",
        contentKey: "radscorpion_trench_text",
        imageKey: "radscorpion_trench",
        daysCost: 1,
        hpChange: -3,
        hpModifiers: [
            { stat: "agility", min: 6, reduction: 2 },
            { stat: "strength", min: 7, reduction: 3 }
        ],
        choices: [{ text: "Continue", target: "wasteland_junction" }]
    },
    // III. Interlude (expanded)
    "wasteland_junction": {
        id: "wasteland_junction",
        content: "[wasteland_junction] A fork in the road. You see a merchant, a shack, a trail, and a faint campfire glow in the distance.",
        contentKey: "wasteland_junction_text",
        imageKey: "wasteland_junction",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { text: "Visit the traveling merchant", target: "traveling_merchant" },
            { text: "Search the abandoned shack", target: "abandoned_shack" },
            { text: "Take the path (ambush)", target: "wasteland_ambush" },
            { text: "Follow the campfire glow", target: "campfire_rest" },
            { text: "Move on to the village", target: "crossroads_village" }
        ]
    },
    "traveling_merchant": {
        id: "traveling_merchant",
        content: "[traveling_merchant] The merchant tells you about a nearby mercenary camp that welcomes recruits for physical training. 'They'll make you stronger, but it takes time.'",
        contentKey: "traveling_merchant_text",
        imageKey: "traveling_merchant",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { text: "Ask about the training camp", target: "training_grounds" },
            { text: "Return to junction", target: "wasteland_junction" }
        ]
    },
    "abandoned_shack": {
        id: "abandoned_shack",
        content: "[abandoned_shack] You find pre-war logs and some supplies. As you leave, you take a wrong turn and end up far from the junction.",
        contentKey: "abandoned_shack_text",
        imageKey: "abandoned_shack",
        daysCost: 0,
        hpChange: 0,
        choices: [{ text: "Continue forward (no way back)", target: "crossroads_village" }]
    },
    "wasteland_ambush": {
        id: "wasteland_ambush",
        content: "[wasteland_ambush] Ambush! (HP -2, Agility ≥ 6 reduces to -1, Strength ≥ 8 reduces to -1)",
        contentKey: "wasteland_ambush_text",
        imageKey: "wasteland_ambush",
        daysCost: 1,
        hpChange: -2,
        hpModifiers: [
            { stat: "agility", min: 6, reduction: 1 },
            { stat: "strength", min: 8, reduction: 1 }
        ],
        choices: [{ text: "Return to junction", target: "wasteland_junction" }]
    },
    "campfire_rest": {
        id: "campfire_rest",
        content: "[campfire_rest] A small campfire with a lone traveler. He offers you a safe place to rest. (Rest: +2 HP, -2 days, no other changes)",
        contentKey: "campfire_rest_text",
        imageKey: "campfire_rest",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { 
                text: "Rest here", 
                target: "campfire_rest",
                on_select: { action: "rest", hpGain: 2, daysCost: 2 }
            },
            { text: "Thank him and leave", target: "wasteland_junction" }
        ]
    },
    "training_grounds": {
        id: "training_grounds",
        content: "[training_grounds] You find an old pre-war gym with functional weights. You can train for two days to improve your body.",
        contentKey: "training_grounds_text",
        imageKey: "training_grounds",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { 
                text: "Train (lose 2 days, Strength +1, Endurance +1)", 
                target: "training_grounds",
                on_select: { action: "train", stat1: "strength", stat2: "endurance", daysCost: 2 }
            },
            { text: "Leave", target: "wasteland_junction" }
        ]
    },
    // IV. Second Hub
    "crossroads_village": {
        id: "crossroads_village",
        content: "[crossroads_village] A small settlement. You can rest, trade, or take quests.",
        contentKey: "crossroads_village_text",
        imageKey: "crossroads_village",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { text: "Visit the village trader", target: "village_trader" },
            { text: "Talk to NCR contact", target: "ncr_village_contact" },
            { text: "Talk to Brotherhood contact", target: "brotherhood_village_contact" },
            { text: "Investigate Enclave rumors", target: "enclave_rumor" },
            { text: "Explore the deathclaw cave", target: "deathclaw_cave" },
            { text: "Visit the ghoul doctor", target: "ghoul_doctor" },
            { text: "Head directly to the Depot", target: "depot_gate" }
        ]
    },
    "village_trader": {
        id: "village_trader",
        content: "[village_trader] You browse goods.",
        contentKey: "village_trader_text",
        imageKey: "village_trader",
        daysCost: 0,
        hpChange: 0,
        choices: [{ text: "Return to village", target: "crossroads_village" }]
    },
    "ncr_village_contact": {
        id: "ncr_village_contact",
        content: "[ncr_village_contact] An NCR agent asks you to deliver a message.",
        contentKey: "ncr_village_contact_text",
        imageKey: "ncr_village_contact",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { text: "Accept", target: "ncr_outpost_depot" },
            { text: "Decline", target: "crossroads_village" }
        ]
    },
    "ncr_outpost_depot": {
        id: "ncr_outpost_depot",
        content: "[ncr_outpost_depot] NCR outpost near the Depot.",
        contentKey: "ncr_outpost_depot_text",
        imageKey: "ncr_outpost_depot",
        daysCost: 1,
        hpChange: 0,
        choices: [
            { text: "Accept supply quest", target: "raider_camp" },
            { text: "Go to Depot directly", target: "depot_gate" }
        ]
    },
    "raider_camp": {
        id: "raider_camp",
        content: "[raider_camp] You clear a raider camp. (HP -4, Strength ≥ 7 reduces to -2, Agility ≥ 6 reduces to -2)",
        contentKey: "raider_camp_text",
        imageKey: "raider_camp",
        daysCost: 1,
        hpChange: -4,
        hpModifiers: [
            { stat: "strength", min: 7, reduction: 2 },
            { stat: "agility", min: 6, reduction: 2 }
        ],
        choices: [{ text: "Return to NCR outpost", target: "depot_gate" }]
    },
    "brotherhood_village_contact": {
        id: "brotherhood_village_contact",
        content: "[brotherhood_village_contact] A Brotherhood initiate wants tech from a Yao Guai cave.",
        contentKey: "brotherhood_village_contact_text",
        imageKey: "brotherhood_village_contact",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { text: "Accept", target: "yaoguai_cave_tech" },
            { text: "Decline", target: "crossroads_village" }
        ]
    },
    "yaoguai_cave_tech": {
        id: "yaoguai_cave_tech",
        content: "[yaoguai_cave_tech] You fight a Yao Guai. (HP -3, Strength ≥ 7 reduces to -1, Agility ≥ 6 reduces to -1)",
        contentKey: "yaoguai_cave_tech_text",
        imageKey: "yaoguai_cave_tech",
        daysCost: 1,
        hpChange: -3,
        hpModifiers: [
            { stat: "strength", min: 7, reduction: 2 },
            { stat: "agility", min: 6, reduction: 2 }
        ],
        choices: [{ text: "Return to village", target: "depot_gate" }]
    },
    "enclave_rumor": {
        id: "enclave_rumor",
        content: "[enclave_rumor] You hear rumors of Enclave activity.",
        contentKey: "enclave_rumor_text",
        imageKey: "enclave_rumor",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { text: "Investigate", target: "enclave_scout_patrol" },
            { text: "Ignore", target: "crossroads_village" }
        ]
    },
    "enclave_scout_patrol": {
        id: "enclave_scout_patrol",
        content: "[enclave_scout_patrol] Enclave patrol attacks. (HP -2, Charisma ≥ 8 reduces to 0, Agility ≥ 7 reduces to 0)",
        contentKey: "enclave_scout_patrol_text",
        imageKey: "enclave_scout_patrol",
        daysCost: 1,
        hpChange: -2,
        hpModifiers: [
            { stat: "charisma", min: 8, reduction: 2 },
            { stat: "agility", min: 7, reduction: 2 }
        ],
        choices: [
            { text: "Escape", target: "depot_gate" },
            { text: "Get captured", target: "enclave_bunker" }
        ]
    },
    "enclave_bunker": {
        id: "enclave_bunker",
        content: "[enclave_bunker] You are held in an Enclave bunker. (HP -1, Intelligence ≥ 7 reveals data and gives clue)",
        contentKey: "enclave_bunker_text",
        imageKey: "enclave_bunker",
        daysCost: 1,
        hpChange: -1,
        hpModifiers: [
            { stat: "intelligence", min: 7, reduction: 1 }
        ],
        choices: [
            { 
                text: "Escape with data", 
                target: "depot_gate",
                condition: "intelligence >= 7",
                extra_content: "You download Enclave files naming the saboteur.",
                extraContentKey: "enclave_bunker_choice_0_extra",
                on_select: { action: "add_clue", clue_id: 2 }
            },
            { text: "Escape without data", target: "depot_gate" }
        ]
    },
    "deathclaw_cave": {
        id: "deathclaw_cave",
        content: "[deathclaw_cave] A deathclaw blocks the shortcut. (2 days, HP -5 if fight; Perception ≥ 7 or Agility ≥ 8 avoids damage)",
        contentKey: "deathclaw_cave_text",
        imageKey: "deathclaw_cave",
        daysCost: 2,
        hpChange: -5,
        hpModifiers: [
            { stat: "perception", min: 7, reduction: 5 },
            { stat: "agility", min: 8, reduction: 5 }
        ],
        choices: [
            { text: "Take the shortcut", target: "depot_gate" },
            { text: "Turn back", target: "crossroads_village" }
        ]
    },
    "ghoul_doctor": {
        id: "ghoul_doctor",
        content: "[ghoul_doctor] A ghoul doctor needs a mirelurk gland.",
        contentKey: "ghoul_doctor_text",
        imageKey: "ghoul_doctor",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { text: "Help", target: "mirelurk_lake" },
            { text: "Refuse", target: "crossroads_village" }
        ]
    },
    "mirelurk_lake": {
        id: "mirelurk_lake",
        content: "[mirelurk_lake] You fight a mirelurk. (HP -3, Strength ≥ 7 reduces to -1, Perception ≥ 6 reduces to -1)",
        contentKey: "mirelurk_lake_text",
        imageKey: "mirelurk_lake",
        daysCost: 1,
        hpChange: -3,
        hpModifiers: [
            { stat: "strength", min: 7, reduction: 2 },
            { stat: "perception", min: 6, reduction: 2 }
        ],
        choices: [{ text: "Return to ghoul doctor", target: "crossroads_village" }]
    },
    // V. Depot
    "depot_gate": {
        id: "depot_gate",
        content: "[depot_gate] The entrance to the military depot.",
        contentKey: "depot_gate_text",
        imageKey: "depot_gate",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { text: "Main entrance", target: "depot_robots" },
            { 
                text: "Side entrance (Strength ≥ 7 or Perception ≥ 6)", 
                target: "depot_armory",
                condition: "strength >= 7 or perception >= 6"
            }
        ]
    },
    "depot_robots": {
        id: "depot_robots",
        content: "[depot_robots] Security robots attack. (HP -3, Agility ≥ 6 reduces to -1, Intelligence ≥ 8 reduces to 0)",
        contentKey: "depot_robots_text",
        imageKey: "depot_robots",
        daysCost: 1,
        hpChange: -3,
        hpModifiers: [
            { stat: "agility", min: 6, reduction: 2 },
            { stat: "intelligence", min: 8, reduction: 3 }
        ],
        choices: [
            { text: "Go to the lab", target: "depot_lab" },
            { text: "Skip lab and go to reactor", target: "depot_reactor" }
        ]
    },
    "depot_armory": {
        id: "depot_armory",
        content: "[depot_armory] You find weapons and then proceed to the lab.",
        contentKey: "depot_armory_text",
        imageKey: "depot_armory",
        daysCost: 0,
        hpChange: 0,
        choices: [{ text: "Continue to lab", target: "depot_lab" }]
    },
    "depot_lab": {
        id: "depot_lab",
        content: "[depot_lab] Pre-war lab. You find a holotape with evidence of the saboteur. (HP -2 gas, Perception ≥ 7 or Endurance ≥ 7 reduces to 0)",
        contentKey: "depot_lab_text",
        imageKey: "depot_lab",
        daysCost: 1,
        hpChange: -2,
        hpModifiers: [
            { stat: "perception", min: 7, reduction: 2 },
            { stat: "endurance", min: 7, reduction: 2 }
        ],
        choices: [
            { 
                text: "Take the holotape and go to reactor", 
                target: "depot_reactor",
                on_select: { action: "add_clue", clue_id: 3 }
            }
        ]
    },
    "depot_reactor": {
        id: "depot_reactor",
        content: "[depot_reactor] Gecko nest guarding the regulator. (HP -4, Strength ≥ 7 reduces to -2, Agility ≥ 6 reduces to -1)",
        contentKey: "depot_reactor_text",
        imageKey: "depot_reactor",
        daysCost: 1,
        hpChange: -4,
        hpModifiers: [
            { stat: "strength", min: 7, reduction: 2 },
            { stat: "agility", min: 6, reduction: 3 }
        ],
        choices: [{ text: "Secure the regulator", target: "depot_escape" }]
    },
    "depot_escape": {
        id: "depot_escape",
        content: "[depot_escape] Enclave arrive! Escape with regulator. (HP -2, Charisma ≥ 7 reduces to 0, Agility ≥ 7 reduces to 0)",
        contentKey: "depot_escape_text",
        imageKey: "depot_escape",
        daysCost: 1,
        hpChange: -2,
        hpModifiers: [
            { stat: "charisma", min: 7, reduction: 2 },
            { stat: "agility", min: 7, reduction: 2 }
        ],
        choices: [
            { text: "Escape", target: "return_road" },
            { 
                text: "Confront (requires Enclave data)", 
                target: "depot_climax_alt",
                condition: "hasFlag:clue_2"
            }
        ]
    },
    "depot_climax_alt": {
        id: "depot_climax_alt",
        content: "[depot_climax_alt] You use the Enclave data to negotiate your escape. The Enclave agents are impressed and let you go peacefully. You suffer no additional harm, and you gain valuable information about their operations.",
        contentKey: "depot_climax_alt_text",
        imageKey: "depot_climax_alt",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { 
                text: "Leave", 
                target: "return_road",
                on_select: { action: "set_flag", flag: "confronted_enclave", value: true }
            }
        ]
    },
    // VI. Return & Resolution
    "return_road": {
        id: "return_road",
        content: "[return_road] You travel back to Vault 42. (1 day passes)",
        contentKey: "return_road_text",
        imageKey: "return_road",
        daysCost: 1,
        hpChange: 0,
        choices: [{ text: "Enter the vault", target: "vault_reentry" }]
    },
    "vault_reentry": {
        id: "vault_reentry",
        content: "[vault_reentry] You re-enter the vault. The saboteur must be identified.",
        contentKey: "vault_reentry_text",
        imageKey: "vault_reentry",
        daysCost: 0,
        hpChange: 0,
        choices: [{ text: "Proceed to trial", target: "trial_start" }]
    },
    "trial_start": {
        id: "trial_start",
        content: "You stand before the vault council. The saboteur must be identified.",
        contentKey: "trial_start_text",
        imageKey: "trial_start",
        daysCost: 0,
        hpChange: 0,
        choices: [{ text: "Present the evidence", target: "determine_culprit" }]
    },
    "determine_culprit": {
        id: "determine_culprit",
        content: "",
        daysCost: 0,
        hpChange: 0,
        isLogicNode: true,
        choices: []
    },
    "sentencing": {
        id: "sentencing",
        content: "The saboteur stands before you. What is your judgment?",
        contentKey: "sentencing_text",
        imageKey: "sentencing",
        daysCost: 0,
        hpChange: 0,
        choices: [
            { text: "Show mercy (imprisonment)", target: "epilogue", on_select: { action: "set_sentence", sentence: "mercy" } },
            { text: "Exile to the wasteland", target: "epilogue", on_select: { action: "set_sentence", sentence: "exile" } },
            { text: "Execute", target: "epilogue", on_select: { action: "set_sentence", sentence: "execution" } }
        ]
    },
    "epilogue": {
        id: "epilogue",
        content: "",
        daysCost: 0,
        hpChange: 0,
        isDynamic: true,
        choices: []
    },
    // Game Over nodes
    "game_over_death": {
        id: "game_over_death",
        content: "💀 You have died. The wasteland claims another soul. Game over. 💀",
        contentKey: "game_over_death_text",
        imageKey: "game_over_death",
        daysCost: 0,
        hpChange: 0,
        choices: [{ text: "Restart", target: "RESTART" }]
    },
    "game_over_time": {
        id: "game_over_time",
        content: "⏰ Time runs out. Vault 42 falls silent. Everyone asphyxiates. Game over. ⏰",
        contentKey: "game_over_time_text",
        imageKey: "game_over_time",
        daysCost: 0,
        hpChange: 0,
        choices: [{ text: "Restart", target: "RESTART" }]
    }
};

// ------------------- Playlist Functions -------------------
function initPlaylist() {
    audioPlayer = document.getElementById("bg-music");
    if (!audioPlayer || playlist.length === 0) return;
    audioPlayer.src = playlist[0];
    audioPlayer.addEventListener("ended", function() {
        currentTrack = (currentTrack + 1) % playlist.length;
        audioPlayer.src = playlist[currentTrack];
        audioPlayer.play().catch(e => console.log("Playback error", e));
    });
}

function startMusic() {
    if (audioPlayer && audioPlayer.paused) {
        audioPlayer.play().catch(e => console.log("Autoplay blocked", e));
    }
}

// ------------------- Helper Functions -------------------
function updateStatsDisplay() {
    document.getElementById("hp-value").innerText = gameState.hp;
    document.getElementById("max-hp-value").innerText = gameState.maxHp;
    document.getElementById("days-value").innerText = gameState.daysLeft;
    document.getElementById("clues-value").innerText = gameState.flags.cluesFound || 0;
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
        hp: gameState.hp,
        maxHp: gameState.maxHp,
        daysLeft: gameState.daysLeft,
        flags: gameState.flags,
        special: { ...gameState.special }
    };
    localStorage.setItem("vault5_save", JSON.stringify(saveData));
}

function loadGame() {
    const saved = localStorage.getItem("vault5_save");
    if (!saved) return false;
    try {
        const data = JSON.parse(saved);
        gameState.currentNodeId = data.currentNodeId;
        gameState.hp = data.hp;
        gameState.maxHp = data.maxHp;
        gameState.daysLeft = data.daysLeft;
        gameState.flags = data.flags || {};
        gameState.special = data.special;
        updateStatsDisplay();
        return true;
    } catch(e) {
        console.error("Failed to load save", e);
        return false;
    }
}

function clearSave() {
    localStorage.removeItem("vault5_save");
}

function resetGame() {
    clearSave();
    gameState.special = {
        strength: 5,
        perception: 5,
        endurance: 5,
        charisma: 5,
        intelligence: 5,
        agility: 5,
        luck: 5
    };
    gameState.maxHp = 2 * gameState.special.endurance;
    gameState.hp = gameState.maxHp;
    gameState.daysLeft = 15;
    gameState.flags = {};
    gameState.currentNodeId = "vault_start";
    updateStatsDisplay();
    showCreationScreen();
}

function applyNodeEffects(node) {
    let hpLoss = node.hpChange || 0;
    if (node.hpModifiers && Array.isArray(node.hpModifiers)) {
        for (let mod of node.hpModifiers) {
            const statValue = gameState.special[mod.stat];
            if (statValue >= mod.min) {
                hpLoss += mod.reduction;
            }
        }
        if (hpLoss > 0) hpLoss = 0;
    }
    gameState.hp += hpLoss;
    if (node.daysCost) gameState.daysLeft -= node.daysCost;
    if (gameState.hp > gameState.maxHp) gameState.hp = gameState.maxHp;
    if (gameState.hp < 0) gameState.hp = 0;
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

function displayGameOverNode(nodeId) {
    const node = storyData[nodeId];
    if (!node) return;
    let displayText = node.content;
    if (node.contentKey && textMap[node.contentKey]) {
        displayText = textMap[node.contentKey];
    }
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
    const culpritCorrect = gameState.flags.culpritCorrect || false;
    const sentence = gameState.flags.sentence;

    if (!culpritIdentified) {
        text += "But the saboteur remains at large, hidden among the dwellers. Trust is broken, and paranoia festers in the corridors like a disease nobody wants to name. The Overseer thanks you with a hollow smile – she knows, as you do, that the real threat still watches from the shadows. Meals are eaten in silence. Neighbors eye each other over the hydroponic soy. The water chip works again, but nobody trusts the water.\n\n";
        text += "You lie awake at night, staring at the riveted ceiling, wondering which face hides the knife. Marcus is still there, still smiling that too‑wide smile. You have no proof, only instinct. And instinct, in Vault‑Tec's world, is worth less than the lint in your pocket.\n\n";
        text += "The vault survives. But survival isn't the same as living. You saved them from the reactor, but you couldn't save them from themselves. Some victories taste like ash.\n\n";
    } 
    else if (culpritCorrect) {
        text += "You have unmasked the true traitor: Marcus, the Overseer's assistant. The evidence is undeniable – a holotape, a terminal log, a confession that spills out like rancid oil. The dwellers gasp. Security cuffs him. His smile finally cracks, revealing the rot beneath.\n\n";
        text += "'Vault‑Tec promised me a place in a control vault,' he snarls. 'They said I'd be safe. I was just following orders.' The words hang in the recycled air, heavy and pathetic. Following orders. The oldest excuse for the worst crimes.\n\n";
        
        if (sentence === "mercy") {
            text += "You show mercy. Marcus is imprisoned in the vault's brig – a converted storage closet with a cot and a bucket. He'll spend his days scrubbing pipes and repairing filtration units. Some call you weak. They whisper that you should have put a bullet in his head. But others see wisdom in redemption – or maybe they're just tired of blood.\n\n";
            text += "Marcus works in silence. He doesn't thank you. He doesn't curse you. He just exists, a ghost in a jumpsuit. The vault breathes easier, but the scar remains. You pass him in the corridor sometimes. He looks away. So do you.\n\n";
        } 
        else if (sentence === "exile") {
            text += "You cast Marcus into the wasteland without a weapon, without a canteen, without hope. The vault door seals behind him. His last look is not anger, but something worse: resignation. He knew this was coming. He always knew.\n\n";
            text += "The dwellers cheer. Justice, they call it. But you can't shake the image of him walking into the dust, alone, under a sky the color of a healing bruise. He won't survive the night. The radscorpions will see to that.\n\n";
            text += "The vault is safe. But safety built on exile feels like a bandage on a wound that needs stitches. You tell yourself he deserved it. Most nights, you almost believe it.\n\n";
        } 
        else if (sentence === "execution") {
            text += "Marcus is executed by firing squad in the atrium. The plastic tree watches, its leaves dusted for the occasion. The shots echo off the metal walls – three sharp cracks, then silence. His body crumples, a red stain spreading on the concrete.\n\n";
            text += "His last words are a curse – not on you, but on Vault‑Tec, on the world, on the whole rotten system that made him a pawn. The dwellers turn away, suddenly ashamed. Nobody cheers. Nobody cries. They just… leave.\n\n";
            text += "You stand alone with the body, the regulator still warm in your hands. Order is restored. Fear is replaced by something colder. The vault is safe. But you wonder, sometimes, if you executed the wrong person after all. Not Marcus – yourself.\n\n";
        }
    } 
    else {
        text += "You accuse an innocent dweller based on flimsy evidence – a hunch, a whisper, a desperate need to blame someone. The council listens. The dwellers shout for blood. And you give it to them.\n\n";
        text += "The real saboteur remains hidden, maybe laughing, maybe watching from the shadows. The vault's unity crumbles like old concrete. Your reputation – once a hero's – shatters into a thousand pieces. People avoid you in the corridors. They whisper behind your back. 'Wrong man,' they say. 'Finger pointed the wrong way.'\n\n";
        
        if (sentence === "mercy") {
            text += "You show mercy to the innocent. He is imprisoned – not in the brig, but in a corner of the hydroponics bay, under guard. He doesn't speak. He doesn't eat. He just sits, staring at the plastic tree, his eyes empty.\n\n";
            text += "The whispers follow you forever. 'She let him live,' they say, 'but she killed his soul.' You visit him once. He looks through you like you're made of glass. You never go back.\n\n";
            text += "The vault endures, but it's a hollow shell. Trust is a currency nobody spends. And you, the hero of Vault 5, are its most indebted citizen.\n\n";
        } 
        else if (sentence === "exile") {
            text += "You cast an innocent family into the wasteland – a father, a mother, a child no older than five. The vault door seals behind them. The mother's eyes haunt you. The child's silence is louder than any scream.\n\n";
            text += "You will never forget their faces. They stare at you in your dreams, asking why. You have no answer. Only the hollow echo of your own voice, shouting 'traitor' at the wrong target.\n\n";
            text += "The wasteland outside is harsh. They won't last a week. And when they're gone, you'll still be here, living with the weight of their exile. Justice? No. Just tragedy wearing a hero's badge.\n\n";
        } 
        else if (sentence === "execution") {
            text += "Blood stains the atrium floor. You executed the wrong person. The innocent's last words were not a curse, but a question: 'Why?' You have no answer. The bullet left your gun, but the guilt never leaves you.\n\n";
            text += "The dwellers turn away. The Overseer avoids your gaze. Even the security guards shuffle their feet, uncomfortable. You wanted justice. You got murder.\n\n";
            text += "The vault is safe – the reactor hums, the water flows – but the safety is built on a lie. You go to sleep each night and wake each morning to the same thought: an innocent person died because you were too eager, too angry, too blind.\n\n";
            text += "Some heroes get statues. You get a stain that won't wash out.\n\n";
        }
    }

    text += "The wasteland outside remains harsh – the sun still burns, the radscorpions still skitter, the Enclave still schemes. But for now, Vault 5 endures. The lights stay on. The children grow up. The old die slow.\n\n";
    text += "Your adventure is over. But the wasteland never stops. And somewhere, out there, a regulator waits for the next vault to fail.\n\n";
    text += "Thank you for playing.\n\n";
    text += "— Vault 5 —";
    
    return text;
}

function loadNode(nodeId) {
    if (nodeId === "RESTART") {
        resetGame();
        return;
    }

    const node = storyData[nodeId];
    if (!node) {
        document.getElementById("story-content").innerHTML = formatStoryText("Error: node not found.");
        return;
    }

    // Handle logic node (determine_culprit)
    if (node.isLogicNode) {
        let clues = gameState.flags.cluesFound || 0;
        let culpritCorrect = false;
        let culpritIdentified = false;

        if (clues === 0) {
            culpritIdentified = false;
            gameState.flags.culpritIdentified = false;
            gameState.flags.culpritCorrect = false;
            gameState.currentNodeId = "epilogue";
            loadNode("epilogue");
            return;
        } else if (clues >= 2) {
            culpritCorrect = true;
            culpritIdentified = true;
        } else if (clues === 1) {
            culpritCorrect = Math.random() < 0.5;
            culpritIdentified = true;
        }
        gameState.flags.culpritIdentified = culpritIdentified;
        gameState.flags.culpritCorrect = culpritCorrect;
        gameState.currentNodeId = culpritIdentified ? "sentencing" : "epilogue";
        loadNode(gameState.currentNodeId);
        return;
    }

    // Apply effects and check game over
    applyNodeEffects(node);
    if (checkAndHandleGameOver()) return;

    // Dynamic epilogue generation
    if (node.isDynamic && node.id === "epilogue") {
        document.getElementById("story-content").innerHTML = formatStoryText(generateEpilogue());
        document.getElementById("choices-container").innerHTML = "";
        document.getElementById("rest-button-container").innerHTML = "";
        document.getElementById("node-image").style.display = "none";
        return;
    }

    // Normal node display: use contentKey if available and textMap has it, else fallback to node.content
    let displayText = node.content;
    if (node.contentKey && textMap[node.contentKey]) {
        displayText = textMap[node.contentKey];
    }
    document.getElementById("story-content").innerHTML = formatStoryText(displayText);

    // Image handling
	const imgElement = document.getElementById("node-image");
	if (ENABLE_IMAGES) {
		const imageBasePath = "assets/";
		let imageName = node.imageKey || node.id;
		const imageFile = imageBasePath + imageName + ".jpg";
		const defaultImage = imageBasePath + "default.jpg";
		
		imgElement.src = imageFile;
		imgElement.onload = () => {
			imgElement.style.display = "block";
		};
		imgElement.onerror = () => {
			// Try default image
			imgElement.src = defaultImage;
			imgElement.onerror = () => {
				// If default also fails, hide
				imgElement.style.display = "none";
				imgElement.src = "";
			};
		};
	} else {
		imgElement.style.display = "none";
		imgElement.src = "";
	}

    const choicesDiv = document.getElementById("choices-container");
    choicesDiv.innerHTML = "";
    node.choices.forEach(choice => {
        let conditionMet = true;
        if (choice.condition) {
            if (choice.condition.startsWith("hasFlag:")) {
                const flagName = choice.condition.substring(8);
                conditionMet = !!gameState.flags[flagName];
            } else if (choice.condition.includes(" or ")) {
                const parts = choice.condition.split(" or ");
                conditionMet = false;
                for (let part of parts) {
                    const subParts = part.trim().split(/\s+/);
                    if (subParts.length === 3) {
                        const stat = subParts[0];
                        const op = subParts[1];
                        const val = parseInt(subParts[2]);
                        const statValue = gameState.special[stat];
                        if (op === ">=" && statValue >= val) {
                            conditionMet = true;
                            break;
                        }
                    }
                }
            } else {
                const parts = choice.condition.split(/\s+/);
                if (parts.length === 3) {
                    const stat = parts[0];
                    const op = parts[1];
                    const val = parseInt(parts[2]);
                    const statValue = gameState.special[stat];
                    if (op === ">=" && statValue < val) conditionMet = false;
                }
            }
        }
        if (!conditionMet) return;

        const btn = document.createElement("button");
        btn.innerText = choice.text;
        btn.classList.add("choice-btn");
        btn.onclick = () => {
            // Handle on_select actions
            let shouldStay = false;
            if (choice.on_select) {
                if (choice.on_select.action === "add_clue") {
                    gameState.flags.cluesFound = (gameState.flags.cluesFound || 0) + 1;
                    gameState.flags[`clue_${choice.on_select.clue_id}`] = true;
                    saveGame();
                } else if (choice.on_select.action === "set_sentence") {
                    gameState.flags.sentence = choice.on_select.sentence;
                    saveGame();
                } else if (choice.on_select.action === "set_flag") {
                    gameState.flags[choice.on_select.flag] = choice.on_select.value;
                    saveGame();
                } else if (choice.on_select.action === "rest") {
                    gameState.hp = Math.min(gameState.maxHp, gameState.hp + choice.on_select.hpGain);
                    gameState.daysLeft -= choice.on_select.daysCost;
                    updateStatsDisplay();
                    saveGame();
                    shouldStay = true;
                } else if (choice.on_select.action === "train") {
                    gameState.special[choice.on_select.stat1] += 1;
                    gameState.special[choice.on_select.stat2] += 1;
                    gameState.daysLeft -= choice.on_select.daysCost;
                    updateStatsDisplay();
                    saveGame();
                    shouldStay = true;
                }
            }

            // Show extra content if any
            let extraText = choice.extra_content || "";
            if (choice.extraContentKey && textMap[choice.extraContentKey]) {
                extraText = textMap[choice.extraContentKey];
            }

            if (extraText && !shouldStay) {
                document.getElementById("story-content").innerHTML = formatStoryText(displayText + "\n\n" + extraText);
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

    // Rest button (only at original rest hubs)
    const restContainer = document.getElementById("rest-button-container");
    restContainer.innerHTML = "";
    if (nodeId === "wasteland_junction" || nodeId === "crossroads_village") {
        const restBtn = document.createElement("button");
        restBtn.innerText = "Rest (+2 HP, -2 days)";
        restBtn.classList.add("rest-btn");
        restBtn.onclick = () => {
            gameState.hp = Math.min(gameState.maxHp, gameState.hp + 2);
            gameState.daysLeft -= 2;
            updateStatsDisplay();
            saveGame();
            if (checkAndHandleGameOver()) return;
            loadNode(nodeId);
        };
        restContainer.appendChild(restBtn);
    }
}

// ------------------- Character Creation Logic -------------------
let creationPoints = 5;
let creationStats = {
    strength: 5,
    perception: 5,
    endurance: 5,
    charisma: 5,
    intelligence: 5,
    agility: 5,
    luck: 5
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

function modifyStat(stat, delta) {
    const newVal = creationStats[stat] + delta;
    if (newVal < 1) return;
    if (delta === 1 && creationPoints <= 0) return;
    if (delta === -1) {
        creationStats[stat] = newVal;
        creationPoints++;
    } else if (delta === 1) {
        creationStats[stat] = newVal;
        creationPoints--;
    }
    updateCreationUI();
}

function confirmCreation() {
    gameState.special = { ...creationStats };
    gameState.maxHp = 2 * gameState.special.endurance;
    gameState.hp = gameState.maxHp;
    gameState.daysLeft = 15;
    gameState.flags = {};
    gameState.currentNodeId = "vault_start";
    updateStatsDisplay();
    document.getElementById("creation-modal").style.display = "none";
    clearSave();
    saveGame();
    loadNode("vault_start");
    startMusic();
}

function showCreationScreen() {
    creationPoints = 5;
    creationStats = {
        strength: 5,
        perception: 5,
        endurance: 5,
        charisma: 5,
        intelligence: 5,
        agility: 5,
        luck: 5
    };
    updateCreationUI();
    document.getElementById("creation-modal").style.display = "flex";
    document.getElementById("story-content").innerHTML = "";
    document.getElementById("choices-container").innerHTML = "";
    document.getElementById("rest-button-container").innerHTML = "";
    document.getElementById("node-image").style.display = "none";
}

// ------------------- Restart Button -------------------
function attachRestartButton() {
    const restartBtn = document.getElementById("restart-story-btn");
    if (restartBtn) {
        restartBtn.onclick = () => resetGame();
    }
}

// ------------------- Load Detailed Story JSON -------------------
function loadDetailedStory(callback) {
    fetch("detailed_story.json")
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            textMap = data;
            console.log("Detailed story loaded successfully.");
            // Optional: log first key to verify
            console.log("Sample key 'vault_start_text':", textMap["vault_start_text"]);
            if (callback) callback();
        })
        .catch(error => {
            console.error("Failed to load detailed_story.json:", error);
            console.warn("Using fallback content (short summaries).");
            textMap = {};
            // TEMPORARY TEST: inject a test text to verify engine works
            textMap["vault_start_text"] = "⚠️ TEST: detailed_story.json not loaded. Please check the file location and syntax.\n\nIf you see this, the engine works but the JSON file is missing or invalid.";
            if (callback) callback();
        });
}

// ------------------- Initialization -------------------
document.addEventListener("DOMContentLoaded", () => {
    // Show loading message while fetching JSON
    document.getElementById("story-content").innerHTML = formatStoryText("Loading wasteland tales...");
    document.getElementById("choices-container").innerHTML = "";
    document.getElementById("rest-button-container").innerHTML = "";
    document.getElementById("node-image").style.display = "none";

    initPlaylist();

    loadDetailedStory(() => {
        // Attach UI listeners
        document.getElementById("special-creator").addEventListener("click", (e) => {
            const btn = e.target.closest("button");
            if (!btn) return;
            const stat = btn.getAttribute("data-stat");
            const dir = btn.getAttribute("data-dir");
            if (stat && dir) {
                modifyStat(stat, dir === "up" ? 1 : -1);
            }
        });
        document.getElementById("confirm-creation").addEventListener("click", confirmCreation);
        attachRestartButton();

        const hasSave = loadGame();
        if (hasSave && gameState.currentNodeId && storyData[gameState.currentNodeId]) {
            document.getElementById("creation-modal").style.display = "none";
            loadNode(gameState.currentNodeId);
        } else {
            showCreationScreen();
        }
    });
});