## Purpose
Terminate `extend:right` lines at the first previous pivot when contextSize is zero during prepend merge.

## Requirements

### Requirement: Terminate extend:right lines at first prev pivot when contextSize = 0
When `prependIndicatorResult` merges a newResult with `contextSize = 0`, any newResult line with `extend: 'right'` SHALL be terminated at the start time of the earliest surviving prev line whose first point timestamp is ≥ the newResult line's last point timestamp.

#### Scenario: contextSize=0 with a later prev line — terminate at it
- **WHEN** `contextSize = 0` and a newResult line has `extend: 'right'` with endpoint at timestamp `T1`, and a surviving prev line has first point at timestamp `T2 ≥ T1`
- **THEN** the merged result SHALL contain the newResult line with `extend: 'none'` and its last point timestamp set to `T2`

#### Scenario: contextSize=0 with no later prev line — keep extend:right
- **WHEN** `contextSize = 0` and a newResult line has `extend: 'right'`, and no surviving prev line has first point timestamp ≥ the newResult line's endpoint
- **THEN** the merged result SHALL contain the newResult line with `extend: 'right'` unchanged

#### Scenario: contextSize=0 with multiple later prev lines — use earliest
- **WHEN** `contextSize = 0` and multiple surviving prev lines have first point timestamp ≥ the newResult line's endpoint
- **THEN** the newResult line SHALL be terminated at the EARLIEST of those prev line start timestamps

### Requirement: Keep existing contextSize > 0 behavior unchanged
When `contextSize > 0`, the existing extend:right fix logic SHALL remain in effect.

#### Scenario: contextSize > 0 with later prev line — existing behavior preserved
- **WHEN** `contextSize > 0` and a newResult line has `extend: 'right'`, and a surviving prev line has first point timestamp ≥ the newResult line's endpoint
- **THEN** the merged result SHALL contain the newResult line with `extend: 'none'` and its points SHALL NOT be modified

### Requirement: Points array integrity
When a newResult line's last point timestamp is modified during termination, the `points` array SHALL contain all original points except the last, which SHALL have its `time` field updated.

#### Scenario: last point time updated, price preserved
- **WHEN** a newResult line is terminated at a prev line's start timestamp `T2`
- **THEN** the merged line's last point SHALL have `time: T2` and `price` equal to the original last point's price
- **THEN** all other points, `color`, `width`, and `style` SHALL be unchanged
