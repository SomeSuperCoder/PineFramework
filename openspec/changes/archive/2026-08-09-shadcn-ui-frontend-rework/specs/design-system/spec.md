## MODIFIED Requirements

### Requirement: Single design token source
The frontend SHALL maintain a single, typed design token source (`frontend/src/theme/tokens.ts`) containing all colors, radii, spacing, elevations, motion durations, and typography values of the Miro-dark system. The global CSS SHALL mirror those tokens via CSS variables, and a mirror-consistency test SHALL enforce that the CSS `:root` values equal the TS token values.

#### Scenario: CSS mirrors TS tokens
- **WHEN** the mirror-consistency test runs
- **THEN** every token in `:root` SHALL equal the corresponding value in `tokens.ts`
- **AND** the test SHALL fail (RED) when they diverge

#### Scenario: Shadcn theme bridge aliases pf tokens
- **WHEN** the shadcn bridge stylesheet is authored for the adopted component layer
- **THEN** every shadcn CSS theme variable (--background, --foreground, --card, --primary, --secondary, --muted, --accent, --destructive, --border, --input, --ring, --radius, --font-sans, and Tailwind @theme inline equivalents) SHALL be a `var(--pf-*)` reference
- **AND** no literal color value SHALL be added for shadcn themes outside the mirror-consistent `:root` token block

### Requirement: Pill CTA and radius discipline
All primary/secondary/ghost buttons and pill tabs SHALL use full-pill radius (`--pf-radius-full`), cards shall use the token radius scale (4–28px), and the type system SHALL cap font weights at 600 with negative letter-spacing on display sizes, per Miro craft, using the documented fallback font stack (Roobert PRO is unhostable).

#### Scenario: Buttons are pills
- **WHEN** any Button primitive renders (shadcn Button variant or bespoke shell button)
- **THEN** its border-radius SHALL equal the `--pf-radius-full` token (pill)
- **AND** the typography SHALL resolve from the token type scale (weight ≤ 600)

### Requirement: Focus, elevation, motion tokens
The token system SHALL define elevation levels (flat default with strategic depth), focus-visible states, and motion duration/easing tokens that respect `prefers-reduced-motion`. The focus ring SHALL be the DESIGN.md §12 double-ring (`--pf-focus-ring`: 2px canvas gap + 4px brand-blue) on every interactive element's `:focus-visible`, including shadcn components (which consume `--ring` → `--pf-brand-blue` with an offset ring).

#### Scenario: Reduced motion honored
- **WHEN** the OS has reduced-motion enabled
- **THEN** animations SHALL be disabled or minimal per the reduced-motion token rules (global `@media (prefers-reduced-motion: reduce)` block in index.css)

#### Scenario: Focus ring from DESIGN.md
- **WHEN** any interactive element receives keyboard focus
- **THEN** the visible focus indicator SHALL match the `--pf-focus-ring` token (visible on all surfaces, ≥ 3:1 contrast, 2px + offset)
- **AND** no component SHALL suppress focus-visible without a visible replacement

### Requirement: Legacy hardcoded values are removed
Components SHALL NOT contain hardcoded legacy design hex values (the old control-panel palette: `#0d0d18`, `#0f1520`, `#e94560`, and their variants). A repository-wide grep for those values SHALL return zero hits in frontend component source once the change is complete. New shadcn component copies SHALL be considered part of component source and SHALL follow this rule.

#### Scenario: Zero legacy hex
- **WHEN** an engineer greps the frontend source (including `frontend/src/components/ui/**`) for the legacy palette hex values
- **THEN** the result SHALL contain zero matches