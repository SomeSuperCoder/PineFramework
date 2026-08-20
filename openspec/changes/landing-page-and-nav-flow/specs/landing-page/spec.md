## Purpose

The landing page capability introduces a hypermodern, scroll-animated landing view and the navigation state machine that gates entry into the main trading panel — first-time users are welcomed by the landing, returning users land directly in the panel, and the landing can be re-opened at any time from the top bar.

## ADDED Requirements

### Requirement: Landing page rendered on first open
When the user opens the application with no prior entered state, the system SHALL render the landing page instead of the main panel.

#### Scenario: First-ever open
- **WHEN** a user opens the app and no entered state is saved
- **THEN** the landing page is displayed
- **AND** the main panel is not displayed

### Requirement: Landing page visual design
The landing page SHALL present a hypermodern, scroll-animated design with a professional liquid-glass (glassmorphism) aesthetic consistent with the FeralUI design language (raw/neobrutalist boldness + restrained liquid-glass + scroll motion) and the application's existing theme (dark oklch palette, brand yellow accent, Inter font, motion tokens).

#### Scenario: Scroll animation
- **WHEN** the user scrolls through the landing page
- **THEN** content sections reveal and animate progressively as they enter the viewport

#### Scenario: Liquid glass surfaces
- **WHEN** the landing page is rendered
- **THEN** translucent, blurred glass surfaces with layered depth and the brand accent are visible

#### Scenario: Reduced motion respected
- **WHEN** the user has a reduced-motion preference enabled
- **THEN** scroll animations are disabled or minimized and no new motion tokens are introduced

### Requirement: Get Started enters the main panel
When the user clicks the "Get Started" button on the landing page, the system SHALL display the main panel and persist that the user has entered the app.

#### Scenario: Enter via Get Started
- **WHEN** the user clicks "Get Started" on the landing page
- **THEN** the main panel is displayed
- **AND** the entered state is persisted across page loads

### Requirement: Page loads default to main panel after entering
After the user has entered the app, any subsequent page load SHALL default to the main panel.

#### Scenario: Reload after entering
- **WHEN** the user has entered the app and reloads the page
- **THEN** the main panel is displayed
- **AND** the landing page is not displayed

### Requirement: About button opens landing
The top panel SHALL provide an About button that returns the user to the landing page.

#### Scenario: About from main panel
- **WHEN** the user clicks the About button in the top panel
- **THEN** the landing page is displayed

### Requirement: Logo and name open landing
Clicking the application logo or the application name in the top panel SHALL return the user to the landing page.

#### Scenario: Logo click
- **WHEN** the user clicks the app logo in the top panel
- **THEN** the landing page is displayed

#### Scenario: Name click
- **WHEN** the user clicks the app name in the top panel
- **THEN** the landing page is displayed

### Requirement: Landing revisited resets the load default
When the landing page is reached via the About button or the logo/name click, the entered state SHALL be cleared so that the next page load defaults to the landing page again.

#### Scenario: Next load after About
- **WHEN** the user opens the landing via the About button and then reloads the page
- **THEN** the landing page is displayed

#### Scenario: Next load after logo
- **WHEN** the user opens the landing via the logo click and then reloads the page
- **THEN** the landing page is displayed

### Requirement: Main panel behavior unchanged
The main panel SHALL retain all existing behavior and functionality; the landing page is additive and SHALL NOT alter the dashboard, panels, overlays, chart, or bot behavior.

#### Scenario: Dashboard still fully functional
- **WHEN** the user is in the main panel after entering the app
- **THEN** all existing panels, overlays, and chart interactions remain available and behave as before
## ADDED Requirements (landing v2 — interactive charts + FeralUI + advanced motion)

### Requirement: Interactive shadcn charts
The landing page's demo panels SHALL render real shadcn/recharts chart components that react to pointer hover (tooltip/crosshair/highlight), using deterministic demo data (no Math.random at render).

#### Scenario: Hover over the hero chart
- **WHEN** the user hovers the hero chart
- **THEN** a chart tooltip/crosshair appears and the hovered point is highlighted

#### Scenario: Hover over the equity curve
- **WHEN** the user hovers the backtest equity curve
- **THEN** a chart tooltip/crosshair appears for the hovered point

#### Scenario: Hover over the bot sparkline
- **WHEN** the user hovers the bot-status bar chart
- **THEN** the hovered bar is highlighted and its value is shown

### Requirement: FeralUI library integration
The landing page SHALL use the FeralUI library packages (`pullcord`, `feral-blob`) for pre-built animation components: a PullCord physics toggle that switches the landing between the dark and the light Day Session theme, and a JellyBlobMascot accent near the bot panel. The main panel SHALL remain dark regardless of the landing theme.

#### Scenario: PullCord toggles the landing theme
- **WHEN** the user operates the PullCord on the landing
- **THEN** the landing switches between dark and light Day Session themes
- **AND** the choice persists across page loads
- **AND** the main panel theme is unchanged

#### Scenario: Blob mascot visible
- **WHEN** the landing page is rendered
- **THEN** the JellyBlobMascot is visible near the bot-status panel

### Requirement: Advanced scroll and on-hover animations (framer-motion)
The landing page SHALL implement advanced scroll and on-hover animations with framer-motion (NOT Remotion), per the DESIGN.md §7 mapping: parallax, scroll-scrub reveals, magnetic Get Started CTA, 3D card tilt, whileHover glass micro-upgrade, and a restrained hand-rolled hologram foil — all derived from the existing motion LAW tokens (no new tokens) and all collapsing to static under prefers-reduced-motion, with pointer:fine gating for magnetic/tilt/foil.

#### Scenario: Advanced effects active
- **WHEN** a pointer-fine user scrolls/hovers the landing
- **THEN** parallax, scroll-scrub, magnetic, tilt, glass-hover, and foil effects are active and bounded by the DESIGN.md clamps (±4px magnetic, ≤6° tilt, ≤0.15 foil)

#### Scenario: Reduced motion collapses effects
- **WHEN** the user has a reduced-motion preference enabled
- **THEN** all six advanced effects render static (no scroll-linked transforms, no magnetic/tilt/foil)
