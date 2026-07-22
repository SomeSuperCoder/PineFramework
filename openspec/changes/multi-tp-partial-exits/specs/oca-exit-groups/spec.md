## ADDED Requirements

### Requirement: OCA Exit Groups
The engine SHALL group exit orders from the same entry into One-Cancels-All (OCA) groups. When one order in an OCA group fills, the engine SHALL automatically cancel all remaining pending orders in the same group.

#### Scenario: Multiple exits from same entry share OCA group
- **WHEN** strategy.exit("TP1", qty=50, limit=price1) and strategy.exit("TP2", qty=50, limit=price2) are both called for the same entry
- **THEN** both orders SHALL share an OCA group

#### Scenario: OCA cancellation on fill
- **WHEN** one order in an OCA group fills
- **THEN** all other pending orders in the same group SHALL be cancelled immediately

#### Scenario: OCA cancellation on position close
- **WHEN** a position is fully closed (via strategy.close() or any exit)
- **THEN** all remaining OCA group orders for that position SHALL be cancelled

#### Scenario: OCA only applies to same-direction exits
- **WHEN** exit orders have different directions (e.g., one closes long, one closes short)
- **THEN** they SHALL NOT share an OCA group

#### Scenario: OCA does not affect entries
- **WHEN** an entry order and an exit order share the same name
- **THEN** they SHALL NOT be in the same OCA group

#### Scenario: OCA group cleared on new entry
- **WHEN** a new entry opens or adds to a position
- **THEN** any existing OCA groups from the previous entry SHALL be cleared
