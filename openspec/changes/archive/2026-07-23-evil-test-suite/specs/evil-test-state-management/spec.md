## ADDED Requirements

### Requirement: Snapshot/rollback handles edge cases without crashing
The state manager SHALL handle all snapshot and rollback scenarios gracefully, including degenerate cases like rollback without a prior snapshot.

#### Scenario: Rollback without snapshot
- **WHEN** `rollbackToSnapshot(0)` is called without any snapshot having been created
- **THEN** the engine SHALL return false and not crash

#### Scenario: Double rollback
- **WHEN** `rollbackToSnapshot()` is called twice in succession without a new snapshot in between
- **THEN** the second call SHALL return false or roll back further, but not crash

#### Scenario: Rollback to nonexistent snapshot index
- **WHEN** `rollbackToSnapshot(999)` is called with an index that does not exist
- **THEN** the engine SHALL return false without crashing

#### Scenario: Snapshot created, bar executed, rollback, execute again
- **WHEN** a snapshot is created, a bar is executed, then rolled back, then a different bar is executed
- **THEN** the engine state SHALL match the rolled-back state, not the incorrectly advanced state

#### Scenario: Multiple snapshots then rollback to middle
- **WHEN** 5 snapshots are created in sequence and `rollbackToSnapshot(2)` is called
- **THEN** the engine SHALL restore to the state at snapshot 2, discarding snapshots 3-4

#### Scenario: Rollback after forming candle update
- **WHEN** a forming candle update is computed after a snapshot, then rollback
- **THEN** the forming candle state SHALL NOT be persisted into the rolled-back snapshot state

### Requirement: Snapshot/rollback preserves series integrity
After a rollback, all series values SHALL exactly match their state at the time the snapshot was taken.

#### Scenario: Series values restored after rollback
- **WHEN** OHLCV values change between snapshot and rollback
- **THEN** after rollback, all series SHALL contain the snapshot-time values

#### Scenario: Output values restored after rollback
- **WHEN** plot outputs accumulate between snapshot and rollback
- **THEN** after rollback, output series SHALL match snapshot-time state
