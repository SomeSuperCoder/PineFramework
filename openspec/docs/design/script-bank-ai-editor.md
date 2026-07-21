# Design Document: Script Bank, AI Agent, and Editor

## 1. Script Bank Architecture

### 1.1 Overview
The Script Bank provides persistent storage and management for Pine Script programs. Users can create, update, delete, and select scripts from a centralized bank, with the active script selection persisted across restarts.

### 1.2 Data Model
```
ScriptEntry: {
  id: string (UUID),
  name: string,
  source: string (Pine Script code),
  scriptType: "indicator" | "strategy" | "library",
  createdAt: number (timestamp),
  updatedAt: number (timestamp)
}

ScriptBankData: {
  scripts: ScriptEntry[],
  activeScriptId: string | null
}
```

### 1.3 Storage
- Single JSON file at `backend/data/scripts.json`
- Same `JsonStore` infrastructure used for `telegram.json`
- Auto-creates directory and file with defaults on first launch
- Schema: `{ scripts: [], activeScriptId: null }`

### 1.4 Backend API Endpoints
```
GET    /api/scripts                  → List all scripts
POST   /api/scripts                  → Create a new script { name, source }
GET    /api/scripts/:id              → Get a single script
PUT    /api/scripts/:id              → Update script { name?, source? }
DELETE /api/scripts/:id              → Delete a script (auto-removes running indicators referencing it)
PUT    /api/scripts/active           → Set active script { scriptId }
GET    /api/scripts/active           → Get active script (full entry + source)

GET    /api/indicators               → List running indicators on chart
POST   /api/indicators               → Add running indicator { scriptId, name, overlay }
DELETE /api/indicators/:id           → Remove running indicator from chart
```

### 1.5 Frontend Components
- **CodeEditor (Unified)**: The sole interface for script management and editing
  - Dropdown at top listing all saved scripts by name
  - Textarea for editing Pine Script source code
  - "New Script" button creates a blank script with default template
  - "Delete" button removes the currently selected script
  - Auto-saves source changes on every edit (debounced) without re-executing the chart
  - "Add" button adds the current script as a new indicator to the chart (appends to running indicators, does NOT replace existing ones)
  - Script name auto-extracted from `strategy("Name", ...)` or `indicator("Name", ...)` in source
  - On open, loads the currently running script's source (not the last-edited script)
- **ScriptBankPanel**: REMOVED — superseded by the unified CodeEditor dropdown

### 1.6 Integration with Existing Flow
- On app load, fetch active script from `GET /api/scripts/active`
- If active script exists, load its source into the code editor (but do NOT auto-execute)
- On app load, fetch running indicators from `GET /api/indicators` and re-execute each on the chart
- When user opens the editor, the currently running script is shown by default
- When user switches scripts via dropdown, source loads but chart does NOT re-execute
- When user edits source, changes auto-save to backend but chart does NOT re-execute
- When user clicks "Add", the source is added as a new indicator to the chart (appended, not replaced) and persisted to the running indicators list
- Script name is auto-extracted from the source via regex on `strategy()` or `indicator()` first argument
- The "currently running" script ID is stored separately from the "selected in editor" script ID
- When a script is deleted from the bank, all running indicators referencing it are automatically removed from the chart and the persisted indicator list

---

## 2. AI Agent Integration and File-Based Storage Architecture

### 2.1 Overview
The AI Agent Integration system enables external AI coding agents to create indicators and strategies by writing `.pine` files directly to a designated scripts directory. The system automatically detects these files and syncs them into the Script Bank database, making AI-generated scripts immediately available in the editor without manual import.

### 2.2 Architecture Overview
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AI Agent Integration                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐    │
│  │  AI Coding Agent │────→│  Scripts Directory│────→│  File Watcher    │    │
│  │  (External)      │     │  (backend/data/   │     │  (chokidar)      │    │
│  │                  │     │   scripts/)       │     │                  │    │
│  └──────────────────┘     └──────────────────┘     └──────────────────┘    │
│                                                                             │
│         ┌─────────────────────────────────────────────────────────────┐     │
│         │                    Sync Engine                              │     │
│         │  - File → Database sync (on file change)                   │     │
│         │  - Database → File sync (on API change)                    │     │
│         │  - Conflict resolution                                     │     │
│         │  - Filename sanitization                                   │     │
│         └─────────────────────────────────────────────────────────────┘     │
│                                     │                                       │
│                                     ▼                                       │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐    │
│  │  Script Bank     │←────│  Scripts.json    │←────│  .pine Files     │    │
│  │  Database        │     │  Manifest        │     │  (Individual)    │    │
│  └──────────────────┘     └──────────────────┘     └──────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 File System Structure
```
backend/data/
├── scripts.json                    # Manifest: maps filenames to metadata
├── indicators/                     # Optional subdirectory for indicators
│   ├── sma_crossover.pine
│   └── rsi_divergence.pine
├── strategies/                     # Optional subdirectory for strategies
│   ├── mean_reversion.pine
│   └── momentum_breakout.pine
└── libraries/                      # Optional subdirectory for libraries
    └── math_utils.pine
```

### 2.4 Data Model

**File-Based Script Entry:**
```typescript
interface FileScriptEntry {
  id: string;                    // UUID or hash-based ID
  filename: string;              // Sanitized filename (e.g., "sma_crossover.pine")
  name: string;                  // Human-readable name (e.g., "SMA Crossover")
  source: string;                // Complete Pine Script source code
  scriptType: "indicator" | "strategy" | "library";
  filePath: string;              // Relative path from backend/data/scripts/
  createdAt: number;             // Timestamp
  updatedAt: number;             // Timestamp
  checksum: string;              // MD5/SHA256 of source for change detection
}
```

**Scripts Directory Manifest:**
```typescript
interface ScriptsManifest {
  scripts: FileScriptEntry[];
  lastSyncAt: number;            // Last sync timestamp
  version: number;               // Manifest version for migration
}
```

### 2.5 Sync Engine

**2.5.1 File → Database Sync:**
- File watcher detects `.pine` file creation/modification/deletion
- On creation:
   1. Read file content
   2. Validate Pine Script syntax (basic parse check)
   3. Auto-detect script type from `indicator()`, `strategy()`, or `library()` calls
   4. Extract script name from declaration
   5. Generate unique ID (SHA256 hash of filename + first 100 chars of source)
   6. Register in `scripts.json` manifest
   7. Register in Script Bank database via API
- On modification:
   1. Read updated content
   2. Validate syntax
   3. Update `updatedAt` timestamp
   4. Recompute checksum
   5. Update manifest and database
- On deletion:
   1. Remove from manifest
   2. Remove from Script Bank database
   3. Stop any running indicators using this script

**2.5.1a Full Sync (Startup / Manual):**
- The `FileSyncEngine.fullSync()` method runs on backend startup and on-demand via `POST /api/scripts/files/sync`
- Iterates every `.pine` file in the scripts directory (walking subdirectories recursively) and compares against the manifest
- For each file:
  - **New** (not in manifest): creates manifest entry + ScriptStore entry (same logic as file creation above)
  - **Changed** (mismatched checksum): updates manifest + ScriptStore with new content/timestamp
  - **Unchanged** (matching checksum): if the ScriptStore entry is missing (e.g., after restart), repopulates it — this is critical for database consistency after a full restart
  - **Stale** (in manifest but file missing): removes manifest entry
- After all files are processed, any manifest entries whose files no longer exist are purged

**2.5.2 Database → File Sync:**
- When script is created via API (`POST /api/scripts`):
  1. Generate sanitized filename from script name
  2. Write `.pine` file to scripts directory
  3. Create manifest entry
- When script is updated via API (`PUT /api/scripts/:id`):
  1. Update corresponding `.pine` file
  2. Update manifest entry
- When script is deleted via API (`DELETE /api/scripts/:id`):
  1. Delete corresponding `.pine` file
  2. Remove manifest entry

**2.5.3 Conflict Resolution:**
- Last-write-wins for simultaneous API and file changes
- File watcher events are debounced (100ms) to batch rapid changes
- API writes acquire a file lock before writing
- Checksum comparison prevents unnecessary updates

### 2.6 Filename Sanitization Rules
1. Convert to lowercase
2. Replace spaces with underscores
3. Remove special characters except hyphens and underscores
4. Truncate to 64 characters (excluding extension)
5. Append numeric suffix for conflicts: `my_script.pine` → `my_script_1.pine`
6. Preserve UTF-8 characters for international names

### 2.7 File Watcher Implementation
- Use `chokidar` library for cross-platform file system watching
- Watch `backend/data/scripts/**/*.pine` recursively
- Events: `add`, `change`, `unlink`, `addDir`, `unlinkDir`
- Debounce events by 100ms to batch rapid changes
- Log all file operations for auditing
- Handle watcher errors gracefully (permission issues, etc.)

### 2.8 REST API Extensions

**File Metadata Endpoints:**
```
GET    /api/scripts/files                  → List all scripts with file metadata
GET    /api/scripts/files/:id              → Get file metadata for a script
GET    /api/scripts/files/:id/content      → Get raw file content
POST   /api/scripts/files/sync             → Force sync from filesystem
GET    /api/scripts/files/status           → Get sync status and last sync time
```

**Response Format:**
```json
{
  "id": "abc123",
  "filename": "sma_crossover.pine",
  "name": "SMA Crossover",
  "scriptType": "indicator",
  "filePath": "indicators/sma_crossover.pine",
  "size": 1024,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z",
  "checksum": "a1b2c3d4e5f6..."
}
```

### 2.9 AI Agent Integration Workflow

**Step 1: Agent creates script file**
```bash
# AI agent writes .pine file
echo "//@version=6
indicator('Custom RSI Divergence')
// ... script code ..." > backend/data/scripts/indicators/rsi_divergence.pine
```

**Step 2: File watcher detects change**
- File watcher triggers `add` event
- Sync Engine reads file content
- Validates syntax
- Extracts metadata

**Step 3: Script registered in database**
- Creates entry in `scripts.json`
- Registers via Script Bank API
- Script appears in editor dropdown

**Step 4: User loads script**
- User selects script from dropdown
- Source loads into editor
- User can execute on chart

### 2.10 Bulk Import Support
- Drop multiple `.pine` files in scripts directory
- File watcher processes each file sequentially
- Progress logged for each file
- Errors logged but don't block other files
- Summary report available via `/api/scripts/files/status`

### 2.11 Error Handling
- Invalid syntax: file is skipped, error logged, file remains in directory
- Filename conflict: numeric suffix appended automatically
- File watcher failure: falls back to manual sync via API
- Database write failure: file remains, retry on next sync
- Permission errors: logged, file skipped

---

## 3. Unified Script Editor with Dropdown

### 3.1 Architecture
The unified CodeEditor replaces the previous split between a standalone editor and a separate ScriptBankPanel. It is the sole interface for script management and editing.

### 3.2 Key Features
- **Dropdown**: At top listing all saved scripts by name, organized by optgroups:
  - "My Scripts" — user-created scripts
  - "Built-In Tests" — built-in indicators (read-only)
- **Textarea**: For editing Pine Script source code
- **New Script button**: Creates a blank script with default template
- **Delete button**: Removes the currently selected script (only shown for user scripts; hidden for built-in scripts)
- **Auto-save**: Source changes saved on every edit (debounced) without re-executing the chart
- **Add button (Ctrl+Enter)**: Adds the current script as a new indicator to the chart (appends to running indicators, does NOT replace existing ones)
- **Close button**: Always visible
- **Script name auto-extraction**: From `strategy("Name", ...)` or `indicator("Name", ...)` in source via regex `/\b(?:indicator|strategy|library)\s*\(\s*["']([^"']+)["']/`

### 3.3 Behavioral Rules
- On open, loads the currently running script's source (not the last-edited script)
- When user switches scripts via dropdown, source loads but chart does NOT re-execute
- When user edits source, changes auto-save to backend but chart does NOT re-execute
- When user clicks "Add", the source is added as a new indicator to the chart (appended, not replaced) and persisted to the running indicators list
- The "currently running" script ID is stored separately from the "selected in editor" script ID

### 3.4 Built-In Script Behavior
- Built-in scripts appear in a "Built-In Tests" optgroup in the dropdown
- Active built-in script shows a type badge (indicator → amber, strategy → green) and a "Built-In" label below the editor header
- **Editor**: textarea is `readOnly` with darker background (`#151520`), dimmer text (`#999`), and `not-allowed` cursor for built-in scripts
- **Delete button**: hidden for built-in scripts (simply does not render)
- **Action buttons**: New, Add (Ctrl+Enter), and Close buttons always visible regardless of any scripts existing
- **Auto-select on empty state**: when no user scripts exist, the first built-in script is loaded on startup

### 3.5 Frontend Data Flow
```typescript
const [scripts, setScripts] = useState<ScriptEntry[]>([]);
const [builtInScripts, setBuiltInScripts] = useState<BuiltInScript[]>([]);
const builtInScriptsRef = useRef<BuiltInScript[]>([]);

// On startup:
Promise.all([fetch('/api/scripts'), fetch('/api/scripts/built-in')])
  .then(([userRes, builtInRes]) => {
    setScripts(userRes.json());
    setBuiltInScripts(builtInRes.json());
    builtInScriptsRef.current = builtInRes.json();
  });

// loadScript callback checks builtInScriptsRef first:
const loadScript = useCallback((id: string) => {
  const builtIn = builtInScriptsRef.current.find(s => s.id === id);
  if (builtIn) {
    setSource(builtIn.source);
    setReadOnly(true);
    return;
  }
  // fetch from /api/scripts/:id ...
}, []);
```

---

## 4. Built-In Test Indicators

### 4.1 Overview
The `test_indicators/` directory contains production-ready Pine Script indicator files that are loaded at startup and made available in the script editor as built-in, uneditable, undeletable resources. These serve as reference implementations and allow quick validation of the engine's capabilities. Users can only run them on the chart — they cannot modify or remove them.

### 4.2 Architecture
- **Static assets**: Scripts live in `test_indicators/` as `.pine` files
- **Backend API**: A dedicated endpoint `GET /api/scripts/built-in` serves the list of built-in indicators; the built-in router is registered **before** the generic scripts router to prevent the `/:id` catch-all from swallowing built-in requests
- **Frontend**: Built-in indicators appear in a "Built-In Tests" optgroup in the script editor dropdown
- **Execution**: Built-in scripts use the same execution path as user scripts
- **Immutability**: Built-in scripts are not synced to manifest, cannot be edited, and cannot be deleted

### 4.3 API Design
```
GET /api/scripts/built-in
Response: Array<{
  id: string,           // "builtin_<filename>"
  name: string,         // Extracted from indicator("...")/strategy("...") source; falls back to basename
  source: string,       // Full script source
  type: "indicator" | "strategy"
}>
```

The `extractNameFromContent(source)` helper parses the `indicator("Name")` or `strategy("Name")` declaration via regex `/\b(?:indicator|strategy|library)\s*\(\s*["']([^"']+)["']/` to extract the human-readable name from source, falling back to the filename's basename if no match is found.

### 4.4 Frontend Behavior
- Built-in scripts fetched on startup alongside user scripts via `Promise.all([fetch('/api/scripts'), fetch('/api/scripts/built-in')])`
- Stored in a separate `builtInScripts` state array and mirrored in a `builtInScriptsRef` ref (the ref prevents stale closure / dependency cycles in `loadScript`)
- The `loadScript` callback checks the built-in scripts ref first; if the target ID matches a built-in, it sets source directly from memory rather than making an API call
- Displayed under a `"Built-In Tests"` `<optgroup>` in the script dropdown, with user scripts in a separate `"My Scripts"` optgroup
- Active built-in script shows a type badge (indicator → amber, strategy → green) and a `"Built-In"` label below the editor header
- **Delete button**: shown only when a user script is selected (`currentScript &&`); hidden for built-in scripts (no need to disable — the button simply does not render)
- **Action buttons**: New, Add (Ctrl+Enter), and Close buttons are always visible regardless of whether any scripts exist — the empty state only shows when both user and built-in lists are empty
- **Editor**: textarea is `readOnly` with darker background (`#151520`), dimmer text (`#999`), and `not-allowed` cursor for built-in scripts
- **Auto-select on empty state**: when no user scripts exist, the first built-in script is loaded on startup (source set directly from fetched data, not via the ref-based `loadScript`, to avoid stale-ref timing issues)
- **Delete fallback**: after deleting the last user script, the editor selects the first built-in script rather than showing the default template
- Built-in scripts NOT synced to manifest or file storage

### 4.5 Script ID Convention
Built-in script IDs follow the pattern `builtin_<filename>` (e.g., `builtin_macd`, `builtin_trendcraft-ict-swiftedge`) to distinguish them from user scripts.

### 4.6 Security Considerations
- Built-in scripts are read-only at the API level
- No write/delete endpoints for built-in scripts
- Source validation on load to prevent malformed scripts

---

## 5. Security Considerations

- Scripts are executed in sandboxed environment (existing)
- File paths validated to prevent directory traversal
- File size limits enforced (max 1MB per script)
- Rate limiting on sync operations
