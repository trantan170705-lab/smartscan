# UI/UX DESIGN SYSTEM: OPTICAL INSTRUMENT AESTHETIC (STRICT DUAL-THEME SPEC)

## 1. CORE IDENTITY & THEME POLICY
- **Identity:** Precision Optical Hardware & Blueprint Utility (inspired by Leica M-series UI, Teenage Engineering Field System, and professional camera viewfinders).
- **Theme Policy:** **SUPPORT DUAL THEMES (LIGHT & DARK MODE TOGGLE)** with **STRICTLY FIXED COLOR TOKENS**.
  - *Strict Rule:* The theme switcher must ONLY toggle CSS variables between two predefined, hardware-inspired palettes (Light Paper Slate vs. Darkroom Obsidian). 
  - *No Palette Drift:* Every future prompt/feature added to this project MUST strictly re-use these exact tokens. Never introduce dynamic pastel colors, dynamic blue/purple accents, or light-mode soft gradients.

## 2. HARD BAN LIST (STRICTLY FORBIDDEN TAILWIND CLASSES & PATTERNS)
The coding agent MUST NEVER output any of the following "AI-slop" patterns in EITHER Light or Dark mode:
- **BANNED Classes:** `bg-gradient-*`, `from-indigo-*`, `from-purple-*`, `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl`, `rounded-2xl`, `rounded-3xl`, `animate-bounce`, `backdrop-blur-2xl`.
- **BANNED Layouts:** NO Hero sections, NO Marketing Landing Page, NO Navbar with marketing links ("Features", "Pricing", "About"), NO generic SaaS cards with colored circle icons.
- **BANNED Copy:** NO cheerful AI copy ("Welcome back!", "Get started by scanning your first document! ✨", "Magic happens here"). Use terse, technical hardware labels (`READY`, `NO_DOCS`, `A4_200DPI`, `WASM_IDLE`).
- **BANNED Emojis:** ZERO emojis in the entire UI. Use strictly `1.5px` stroke geometric icons (`lucide-react` with `strokeWidth={1.5}` or custom crisp SVGs).

## 3. EXACT DESIGN TOKENS (LIGHT & DARK DUAL PALETTE)

### A. Dark Mode Tokens (`.dark` or `[data-theme="dark"]`)
- `--bg-void`: `#08080A` (Deep Obsidian — primary darkroom background & viewfinder backdrop).
- `--bg-panel`: `#111114` (Hardware dark sidebars, control dock, inspector rails).
- `--bg-elevated`: `#1A1A1F` (Active segmented controls, hover states, dialogs).
- `--border-hairline`: `rgba(255, 255, 255, 0.08)` (1px crisp structural dividers).
- `--border-active`: `rgba(255, 255, 255, 0.22)` (Focused inputs, selected thumbnails).
- `--accent-laser`: `#FF4D00` (International Signal Orange).
- `--text-primary`: `#F4F4F5` (High-contrast paper white).
- `--text-muted`: `#71717A` (Muted telemetry zinc).

### B. Light Mode Tokens (`:root` / Light Theme Default)
- `--bg-void`: `#EFEFEF` (Technical Blueprint Off-White — neutral, low-glare paper canvas).
- `--bg-panel`: `#FFFFFF` (Pure white crisp hardware panels & sidebars).
- `--bg-elevated`: `#E2E2E5` (Active segmented item background, hovered surface).
- `--border-hairline`: `rgba(0, 0, 0, 0.12)` (Crisp 1px dark hairline divider — NO drop shadows).
- `--border-active`: `rgba(0, 0, 0, 0.30)` (Active frame border).
- `--accent-laser`: `#E64A00` (High-contrast Signal Orange optimized for light backgrounds).
- `--text-primary`: `#09090B` (Ink black).
- `--text-muted`: `#52525B` (Muted technical slate).

### C. Universal Geometry & Typography (Both Themes)
- `--font-ui`: `'Inter', -apple-system, BlinkMacSystemFont, sans-serif` (Labels: `12px–13px`, `font-medium`, `tracking-[-0.01em]`).
- `--font-mono`: `'JetBrains Mono', 'SF Mono', monospace` (`font-variant-numeric: tabular-nums` — MANDATORY for all metadata numbers: page counts `01/08`, dimensions `1800×2545`, file sizes `1.42 MB`, zoom `125%`, shortcut badges `[R]`).
- Strict technical corners: `rounded-[2px]` for document thumbnails & paper previews; `rounded-[4px]` for buttons, panels, and segmented controls; `rounded-full` ONLY for physical shutter button, crop corner rings, status LEDs, and theme toggle button.

## 4. COMPONENT ANATOMY (EXACT PIXEL SPECS)

### A. Theme Switcher (Light/Dark Toggle)
- Position: Top bar (right-aligned next to status indicators).
- Visual: Micro hardware toggle switch `w-[36px] h-[20px] rounded-full p-[2px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)]`.
- Icons: Micro Sun/Moon icon (`12px`, `strokeWidth={1.5}`) sliding with `transition-transform duration-150`.

### B. Physical Shutter Button (Camera Viewfinder)
- Outer ring: `72px × 72px`, `rounded-full`, `border-[3px] border-[var(--text-primary)]`, `p-[4px]`.
- Inner tactile disc: `w-full h-full rounded-full bg-[var(--text-primary)]` (transitions to `var(--accent-laser)` when auto-capture locks).
- Press physics: `active:scale-[0.92] transition-transform duration-75`.
- Capture feedback: Full-screen flash overlay (`opacity-80 -> 0` in `90ms`, `pointer-events-none`) + subtle Web Audio mechanical click sound.

### C. Precision 4-Corner Crop Handles & Touch Magnifier Loupe
- **Polygon Overlay:** `2px` solid `var(--accent-laser)` lines with `rgba(255, 77, 0, 0.12)` interior tint.
- **Corner Handles:**
  - Touch devices: `26px` visible ring (`border-2 border-[var(--accent-laser)] bg-[var(--bg-void)]/60`) with a `48px × 48px` invisible touch hit-target.
  - Desktop mouse: `14px` precision square reticle (`border-[1.5px] border-[var(--accent-laser)]`) with crosshair cursor.
- **Magnifier Loupe (Touch Only):**
  - Appears immediately on `pointerdown` of any corner handle.
  - Circular canvas (`112px` diameter), `border-2 border-[var(--accent-laser)]`, `2.5x` pixel magnification, centered `1px` crosshair lines.
  - Positioned `72px` directly above the touch point (auto-flips downward if near top screen edge) so the fingertip NEVER blocks the paper corner.

### D. Hardware-Style Segmented Filter Switcher
- Container: `bg-[var(--bg-void)] border border-[var(--border-hairline)] p-[3px] rounded-[4px] grid grid-cols-3 gap-[2px]`.
- Items: `ORIGINAL` | `MAGIC` | `B&W` (Uppercase, `11px`, `font-mono`, `tracking-wider`).
- Active item: `bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-active)]`. Inactive: `text-[var(--text-muted)] hover:text-[var(--text-primary)]`.

### E. Telemetry & Empty States
- **Vault Empty State:** Center-aligned dashed hairline box (`border border-dashed border-[var(--border-hairline)] rounded-[4px]`), monospaced telemetry text:
  `NO_DOCUMENTS_INDEXED`
  `DROP IMAGES HERE OR ACTIVATE VIEWFINDER`
- **WASM Processing Indicator:** NO spinning loading circles. Use a razor-thin `2px` `var(--accent-laser)` progress bar at the top edge of the canvas + inline mono status pill `PROCESSING_QUAD // 42ms`.

## 5. ADAPTIVE MULTI-DEVICE ERGONOMICS

### 1. Mobile (`< 768px` — Portrait Thumb-Zone)
- Lock viewport to `h-[100dvh] w-screen overflow-hidden select-none`. Canvas MUST have `touch-action: none`.
- Respect iOS/Android safe areas: `pt-[env(safe-area-inset-top)]` and `pb-[env(safe-area-inset-bottom)]`.
- **Top Bar (`48px`):** Back button, `MONO` page counter (`01/04`), Torch toggle, Theme Switcher toggle.
- **Bottom Control Dock (Bottom 25–30%):** Shutter button centered; Gallery Import thumbnail on bottom-left; Multi-page review stack badge on bottom-right.

### 2. Tablet (`768px – 1024px` — Split Studio)
- Document Vault: 3-to-4 column grid with `12px` gap and crisp `1px` hairline borders.
- Scanner/Editor: Split layout — 72% left/center canvas; 28% right vertical tactile control rail for two-handed thumb operation.

### 3. Desktop (`> 1024px` — 3-Pane Workstation)
- **Top Status Strip (`40px`):** Brand mark (`OPTIC.SCAN`), active document title (inline editable), Theme Toggle, `WASM_ENGINE: READY` LED indicator, global Export PDF CTA.
- **Left Rail (`220px`, `border-r border-[var(--border-hairline)]`):** Vertical filmstrip of pages with index numbers (`01`, `02`), drag-to-reorder, rotate, and delete on hover. Bottom action: `+ ADD PAGES / DROP`.
- **Center Workspace (Fluid):** Workstation canvas (`bg-[var(--bg-void)]`) with subtle `20px` dot-grid background (`rgba(128,128,128,0.06)`). Supports:
  - `Ctrl/Cmd + Wheel` zoom (`25%` to `400%`) & `Space + Drag` pan.
  - Full-window Drag & Drop overlay for batch importing `.jpg`, `.png`, `.webp` files.
- **Right Inspector (`280px`, `border-l border-[var(--border-hairline)]`):**
  - Segmented Filter Control (`ORIGINAL`, `MAGIC`, `B&W`).
  - Geometry controls (Re-crop 4 corners, Rotate 90° CW/CCW).
  - Fine-tune sliders (Contrast, Brightness — slim `2px` track with square `var(--accent-laser)` thumb).
  - Output spec selector (A4 / Letter / Fit Image) + Direct Download (`.pdf` / `.jpg`).
- **Keyboard Shortcuts (Displayed as subtle `[KEY]` mono badges):**
  - `Space`: Capture / Confirm Crop | `R`: Rotate 90° | `1`/`2`/`3`: Filters | `←`/`→`: Prev/Next Page | `Ctrl/Cmd + S`: Export PDF | `Esc`: Cancel.

## 6. MOTION & TRANSITION PHYSICS
- Easing: Strictly `cubic-bezier(0.22, 1, 0.36, 1)` (fast, damped, mechanical — zero bounce).
- Durations: Micro-interactions `80ms–120ms`; panel transitions `180ms`; live quad polygon interpolation via `requestAnimationFrame` lerp (`factor = 0.25`) so the detected paper frame glides smoothly without jitter.