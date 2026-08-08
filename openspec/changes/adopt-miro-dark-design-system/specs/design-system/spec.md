## Purpose

Defines the Miro-dark design system for the PineFramework trading dashboard: a single token source (dark-adapted Miro craft), reusable primitives, and the invariant that all styling in components and chart canvas resolves from that source with zero legacy hardcoded values.

## ADDED Requirements

### Requirement: Single design token source
The frontend SHALL maintain a single, typed design token source (`frontend/src/theme/tokens.ts`) containing all colors, radii, spacing, elevations, motion durations, and typography values of the Miro-dark system. The global CSS SHALL mirror those tokens via CSS variables, and a mirror-consistency test SHALL enforce that the CSS `:root` values equal the TS token values.

#### Scenario: CSS mirrors TS tokens
- **WHEN** the mirror-consistency test runs
- **THEN** every token in `:root` SHALL equal the corresponding value in `tokens.ts`
- **AND** the test SHALL fail (RED) when they diverge

### Requirement: Miro-dark palette with brand accent
The token system SHALL adapt Miro design standards to a dark theme: dark carbon canvas and surfaces, brand-yellow (`#ffd02f`) as a reserved brand accent (never a primary CTA background), dark-compatible pastel card tints, ink/muted text scales, semantic success/error/warning tokens, and explicit dark-only policy (no light theme overrides).

#### Scenario: Dark canvas is default
- **WHEN** the application loads
- **THEN** the background canvas SHALL be the dark carbon value from the token source
- **AND** no legacy `#0d0d18`/`#0f1520` hardcoded values SHALL remain in component source

#### Scenario: Brand yellow is accent-only
- **WHEN** a yellow treatment is applied
- **THEN** it SHALL be limited to brand accent use (wordmark, promo/tag chips, accent pill CTA)
- **AND** it SHALL NOT be used as a theme background surface

### Requirement: Pill CTA and radius discipline
All primary/secondary/ghost buttons and pill tabs SHALL use full-pill radius (`rounded-full`), cards shall use the token radius scale (4–24/28px), and the type system SHALL cap font weights at 600 with negative letter-spacing on display sizes, per Miro craft, using the documented fallback font stack (Roobert PRO is unhostable).

#### Scenario: Buttons are pills
- **WHEN** any Button primitive renders
- **THEN** its border-radius SHALL equal the `rounded.full` token (pill)
- **AND** the typography SHALL resolve from the token type scale (weight ≤600)

### Requirement: Focus, elevation, motion tokens
The token system SHALL define elevation levels (flat default with strategic depth), focus-visible states, and motion duration/easing tokens that respect `prefers-reduced-motion`.

#### Scenario: Reduced motion honored
- **WHEN** the OS has reduced-motion enabled
- **THEN** animations SHALL be disabled or minimal per the reduced-motion token rules

### Requirement: Legacy hardcoded values are removed
Components SHALL NOT contain hardcoded legacy design hex values (the old control-panel palette: `#0d0d18`, `#0f1520`, `#e94560`, and their variants). A repository-wide grep for those values SHALL return zero hits in frontend component source once the change is complete.

#### Scenario: Zero legacy hex
- **WHEN** a developer greps component source for the legacy palette hex values
- **THEN** the result SHALL contain zero matches

### Requirement: Accessibility contrast on dark
The token pairs used for text on surfaces SHALL meet WCAG AA contrast (≥ 4.5:1 for body text, ≥ 3:1 for large text and UI components) on the dark theme.

#### Scenario: AA contrast verified
- **WHEN** the dark token pairs are checked for contrast
- **THEN** body text on its surface SHALL be ≥ 4.5:1
- **AND** UI components SHALL be ≥ 3:1

## REMOVED Requirements

### Requirement: Old control-panel token set
**Reason**: The Director mandated removal of all trace of the old design system (CONTROL-PANEL-DESIGN.md token set) with no fallback; `DESIGN-MIRO-DARK.md` replaces it.
**Migration**: Values map through the legacy-mapping table in `DESIGN-MIRO-DARK.md`; the old spec `frontend/src/CONTROL-PANEL-DESIGN.md` is deleted after the zero-grep gate.