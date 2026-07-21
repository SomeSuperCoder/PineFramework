## ADDED Requirements

### Requirement: Error Console
The frontend SHALL provide a dedicated error console panel displaying compilation errors, runtime errors, and script output.

#### Scenario: Error Display
- **WHEN** a script has compilation errors
- **THEN** the error console SHALL display them with file/line references

#### Scenario: Runtime Errors
- **WHEN** a runtime error occurs during execution
- **THEN** the error console SHALL display the error with stack trace

#### Scenario: Script Output
- **WHEN** a script logs output
- **THEN** the error console SHALL display the output log
