# Vault 5 – Fallout Adventure

A browser-based, text-driven RPG built with vanilla HTML/CSS/JS. No framework, no build step — just open `index.html` in a local server and play.

---

## Project Structure

```
/
├── index.html              # Main game shell & character creation modal
├── style.css               # All visual styling
├── game.js                 # Game engine (mechanics, state, rendering)
├── story.json              # Story graph: nodes, effects, choices
├── detailed_story.json     # Long-form prose keyed to each node
└── assets/                 # Scene illustrations (JPG, named after node IDs)
    ├── vault_start.jpg
    ├── overseer_office.jpg
    ├── default.jpg         # Fallback when no node image exists
    └── ...
```

---

## How to Run

The game fetches JSON files at runtime, so it **must be served over HTTP** — double-clicking `index.html` will not work.

```bash
# Python (any machine with Python 3)
python -m http.server 8000

# Node.js
npx serve .
```

Then open `http://localhost:8000` in your browser.

---

## Building a New Story

**The only files you need to edit are `story.json` and `detailed_story.json`.** You do not need to touch `game.js` or `index.html` unless you want to add new mechanics.

### `story.json` — The Story Graph

Each key is a **node ID**. Every node the engine visits must exist here.

```jsonc
{
  "my_node": {
    "id": "my_node",            // Must match the key
    "content": "Fallback text", // Shown if contentKey is missing from detailed_story.json
    "contentKey": "my_node_text", // Key into detailed_story.json for the long prose
    "imageKey": "my_node",      // Filename (without .jpg) in /assets/. Defaults to id if omitted.
    "daysCost": 1,              // Subtracted from daysLeft on arrival (can be 0)
    "hpChange": -2,             // Added to hp on arrival (negative = damage)
    "hpModifiers": [            // Optional: conditional HP adjustments
      {
        "stat": "endurance",    // Any SPECIAL stat (lowercase)
        "min": 6,               // If player's stat >= min...
        "reduction": 2          // ...add this to hpChange (use positive to negate damage)
      }
    ],
    "choices": [ ... ]          // See choices reference below
  }
}
```

> **Reserved node IDs** used by the engine: `vault_start` (entry point), `game_over_death`, `game_over_time`, `epilogue`, `sentencing`, `determine_culprit`. Redefine their content freely, but keep the IDs.

---

### `detailed_story.json` — Prose Text

A flat key/value map. Keys match `contentKey` values in `story.json`. Values are the full narrative text shown to the player. Supports `\n` for line breaks and blank lines between paragraphs.

```jsonc
{
  "my_node_text": "The door groans open.\n\nDust falls from the ceiling. Something moves in the dark.",
  "my_node_choice_extra": "You find a holotape wedged behind the terminal."
}
```

If a `contentKey` is missing here, the engine falls back to `content` in `story.json` — useful for stubs while writing.

---

### Choices Reference

Each choice object inside a node's `"choices"` array:

```jsonc
{
  "text": "Button label shown to the player",
  "target": "next_node_id",         // Node to load after this choice

  // --- Optional fields ---

  "condition": "perception >= 6",   // Hide button if condition not met (see Conditions)
  "extra_content": "Short inline extra text (fallback)",
  "extraContentKey": "key_in_detailed_story", // Long extra text shown before navigating

  "on_select": { ... }              // Action fired when button is clicked (see Actions)
}
```

---

### Conditions

Conditions control whether a choice button is visible. All condition strings are case-sensitive.

| Syntax | Example | Behaviour |
|---|---|---|
| `stat >= N` | `"strength >= 7"` | Visible only if SPECIAL stat meets threshold |
| `stat >= A or stat >= B` | `"strength >= 6 or agility >= 6"` | Visible if either stat qualifies |
| `hasFlag:flagName` | `"hasFlag:found_keycard"` | Visible only if flag is set |
| `notHasFlag:flagName` | `"notHasFlag:door_opened"` | Visible only if flag is **not** set |

Valid stat names: `strength`, `perception`, `endurance`, `charisma`, `intelligence`, `agility`, `luck`.

---

### Actions (`on_select`)

The `on_select` object fires side-effects when the player clicks a choice.

#### `add_clue`
Increments the clue counter and sets a flag. Used for the investigation mechanic.
```jsonc
{ "action": "add_clue", "clue_id": 1 }
```

#### `set_flag`
Sets an arbitrary boolean flag. Use with `hasFlag` / `notHasFlag` conditions to gate later choices.
```jsonc
{ "action": "set_flag", "flag": "found_keycard", "value": true }
```

#### `set_sentence`
Records the player's sentencing choice for the epilogue generator.
```jsonc
{ "action": "set_sentence", "sentence": "mercy" }
// Valid values: "mercy", "exile", "execution"
```

#### `rest`
Heals HP and costs days. The node does **not** advance — the player stays on the current node.
```jsonc
{ "action": "rest", "hpGain": 2, "daysCost": 2 }
```

#### `train`
Raises two SPECIAL stats by 1 each and costs days. Node does not advance.
```jsonc
{ "action": "train", "stat1": "strength", "stat2": "endurance", "daysCost": 3 }
```

#### `adjust`
General-purpose adjustment. All fields are optional; combine freely.
```jsonc
{
  "action": "adjust",
  "hp": 3,                      // Add to HP (negative = damage)
  "days": -1,                   // Add to daysLeft (negative = cost)
  "clue": 2,                    // Add a clue with this ID
  "stat_bonus": "perception",   // Stat to bump
  "stat_bonus_value": 1,        // Amount to add
  "set_flag": "saw_vision"      // Set this flag to true
}
```

---

### Special / Logic Nodes

These node IDs trigger hard-coded engine behaviour. You can write their `content`/`contentKey` freely, but their mechanics are fixed in `game.js`.

| Node ID | Behaviour |
|---|---|
| `vault_start` | Entry point on every new game |
| `game_over_death` | Shown automatically when HP ≤ 0 |
| `game_over_time` | Shown automatically when daysLeft ≤ 0 |
| `determine_culprit` | Logic node — reads clue count, sets `culpritCorrect` / `culpritIdentified` flags, then routes to `sentencing` or `epilogue`. Add no `choices`. |
| `epilogue` | Generates a branching ending from flags (`culpritCorrect`, `culpritIdentified`, `sentence`). Prose is hard-coded in `generateEpilogue()`. |

---

### Images

Place `.jpg` files in `/assets/`. The engine loads `assets/<imageKey>.jpg` for each node (falling back to `assets/default.jpg` if the file is missing, then hiding the image entirely).

- Image display is controlled by the `ENABLE_IMAGES` constant at the top of `game.js` (set to `true` by default).
- If no `imageKey` is specified on a node, the engine uses the node's `id` as the filename.

---

## Game Mechanics Summary

| Mechanic | Where configured |
|---|---|
| Starting HP | `2 × Endurance` (set at character creation) |
| Starting days | 15 |
| HP damage / healing | `hpChange` on nodes, `hpModifiers` for conditional mitigation, `adjust`/`rest` actions on choices |
| Day cost | `daysCost` on nodes, `days` field in `adjust` action, `daysCost` in `rest`/`train` actions |
| SPECIAL stat gates | `condition` on choices |
| Flags | `set_flag` / `add_clue` actions + `hasFlag` / `notHasFlag` conditions |
| Clue system | `add_clue` action increments `cluesFound`; `determine_culprit` node evaluates it |
| Persistent save | Auto-saved to `localStorage` after every state change; restored on reload |
| Background music | Playlist defined in `game.js` → `playlist[]` array (MP3 URLs) |

---

## Tips for Story Authors

- **Write stubs first.** Put short `content` text in `story.json` and fill in `detailed_story.json` prose later. The engine falls back gracefully.
- **Test node IDs early.** If `game.js` can't find a node it logs `Error: Node "x" not found` in the browser console and displays the error on screen.
- **Use `StoryMappingViewer.html`** (included in the repo) to visualise the node graph before playing through it.
- **Flags are global.** Any `set_flag` persists for the rest of that run. Name flags descriptively (`found_keycard`, not `flag1`) to avoid conflicts.
- **`adjust` is the swiss army knife.** When you need to combine multiple effects in one choice (HP change + day cost + clue + flag), `adjust` handles it all without needing a dedicated node.