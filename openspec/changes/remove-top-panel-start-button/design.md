## Context

The LiveDashboard header contains three types of controls: Start Bot, Stop/Emergency Stop/Reset, and UI layout controls (pin, close). The Start Bot button in the header is redundant with the setup wizard's Review step. The pin toggle adds complexity without clear user value.

## Goals / Non-Goals

**Goals:**
- Remove the "Start Bot" button from the LiveDashboard header (Idle/Stopped view)
- Remove the pin/full-screen toggle button from both views
- Preserve all other header functionality (Stop, Emergency Stop, Reset, Close)

**Non-Goals:**
- Changing the setup wizard's Start button behavior
- Modifying the pin/full-screen layout logic (just removing the button)

## Decisions

### Decision 1: Remove buttons directly, no state cleanup needed

The `pinnedToBottom` state and `togglePin` function are only used by the pin button. Removing the button means this state and function become dead code. Remove them to keep the code clean.

**Alternative considered:** Keep the state in case we want to re-add the feature later. Rejected — dead code is technical debt. The feature can be re-added from version control if needed.

## Risks / Trade-offs

- **[Risk]** Users who relied on the pin feature lose it → Low risk: the feature had minimal usage based on the UI design (small icon button, no prominent placement)
- **[Trade-off]** The Start Bot button in the header was a shortcut for power users → The setup wizard's Review step provides the same functionality with more context (config review before start)
