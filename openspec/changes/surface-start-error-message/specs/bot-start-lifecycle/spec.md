## ADDED Requirements

### Requirement: Start error message surfaced to user

When `POST /api/bot/start` fails and returns an error message, the frontend Review step SHALL display the backend's specific error message to the user, not a generic string. The message SHALL be shown in the existing error display area below the Start button.

#### Scenario: Specific error shown on start failure

- **WHEN** the user clicks "Start Bot" on the Review step and the backend returns HTTP 400 with `{ "error": "<message>" }`
- **THEN** the error display area SHALL show the value of `<message>` from the response, not a hardcoded generic string

#### Scenario: Start button re-enabled after error

- **WHEN** the start fails and the error message is displayed
- **THEN** the Start button SHALL be re-enabled (not stuck in "Starting..." state)
