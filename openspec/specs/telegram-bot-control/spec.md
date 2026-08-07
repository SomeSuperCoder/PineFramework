# telegram-bot-control Specification

## Purpose
TBD - created by archiving change telegram-bot-enhancements. Update Purpose after archive.
## Requirements
### Requirement: Admin Identity
The system SHALL designate exactly one admin, the local operator who has access to the control panel. The admin's Telegram identity (numeric `from.id`) is configured in the control panel and used to grant control to others.

#### Scenario: Admin Configured in Panel
- **WHEN** the operator enters their Telegram user id in the control panel
- **THEN** that user is recognized as admin for all privileged bot commands

#### Scenario: Admin Not Configured
- **WHEN** no admin identity is configured
- **THEN** privileged control commands are disabled and the bot responds with guidance to configure the panel

### Requirement: Controller Whitelist
The system MUST maintain a whitelist of controllers who may run control commands (`/stats`, `/stop`, `/emergency`, `/link`, `/unlink`). Controller identity MUST be the Telegram numeric `from.id` — never the username.

#### Scenario: Grant Control via Panel
- **WHEN** the admin approves a pending request in the control panel
- **THEN** the requesting user (by `from.id`) is added to the controllers whitelist with a grantedAt timestamp

#### Scenario: Revoke Control via Panel
- **WHEN** the admin revokes a controller in the control panel
- **THEN** that user is removed from the whitelist and loses all privileged command access

#### Scenario: Privileged Command non-Privileged
- **WHEN** a user who is neither admin nor controller runs `/stop` or `/emergency`
- **THEN** the command is rejected with a permission-denied message

#### Scenario: Identity by from.id Not Username
- **WHEN** a user changes their username
- **THEN** their controller status is unchanged because identity is the immutable numeric `from.id`

### Requirement: Control Requests
The system MUST allow any user to request control via `/request`, storing the request with their `from.id`, username, and display name for admin review.

#### Scenario: Request Control
- **WHEN** an unprivileged user runs `/request`
- **THEN** a pending request is recorded and the user is told their request awaits admin approval

#### Scenario: Duplicate Request
- **WHEN** a user with a pending or granted request runs `/request` again
- **THEN** the bot replies that a request is already pending/granted instead of duplicating

#### Scenario: Admin Lists Requests
- **WHEN** the admin opens the control panel
- **THEN** pending requests are listed with user id, username, display name, and requestedAt

### Requirement: Control vs Subscription Separation
The system MUST treat "may control the bot" and "receives notifications" as independent permissions. Granting control MUST NOT auto-subscribe; subscribing MUST NOT grant control.

#### Scenario: Controller Without Subscription
- **WHEN** a controller does not subscribe to any notification type
- **THEN** they receive no notifications but retain full control access

#### Scenario: Subscriber Without Control
- **WHEN** a subscribed user is not a controller
- **THEN** they receive notifications but cannot run control commands

### Requirement: Stop and Emergency Stop Commands
The system MUST expose `/stop` (graceful, requires confirmation) and `/emergency` (instant, no confirmation) to admin/controllers.

#### Scenario: Graceful Stop
- **WHEN** a controller runs `/stop`
- **THEN** the bot asks for confirmation and only performs the graceful stop after an explicit confirmation reply, then reports the resulting state

#### Scenario: Emergency Stop
- **WHEN** a controller runs `/emergency`
- **THEN** the bot immediately triggers the engine emergency stop, closes positions, and reports the result without a confirmation step

#### Scenario: Stop When Engine Missing
- **WHEN** `/stop` or `/emergency` runs but the trading engine is not available
- **THEN** the bot reports that the engine is not initialized

### Requirement: Stats Command
The system MUST expose `/stats` to admin/controllers showing engine runtime state: running/stopped/error, pairs, position count, daily loss state.

#### Scenario: Stats for Running Engine
- **WHEN** a controller runs `/stats`
- **THEN** the bot replies with current engine state, active pairs, and position summary

