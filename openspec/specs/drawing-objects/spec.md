## Purpose
Implement and verify Line Object Management functionality for the drawing-objects module.

## Requirements

### Requirement: Line Object Management
The engine SHALL support line.new(), line.set_*(), and line.delete() with dynamic modification capabilities.

#### Scenario: Line Creation
- **WHEN** line.new() is called with point1/point2 coordinates
- **THEN** a new line SHALL be created with the specified properties

#### Scenario: Line Modification
- **WHEN** line.set_*() methods are called (set_x1, set_y1, set_x2, set_y2, set_color, set_style, set_width, set_extend, set_pricecolor)
- **THEN** the line properties SHALL be updated

#### Scenario: Single ID Creation
- **WHEN** line.new() is called
- **THEN** a single line object ID SHALL be returned

#### Scenario: Line Delete
- **WHEN** line.delete() is called with the line ID
- **THEN** the line SHALL be removed from the chart

### Requirement: Label Object Management
The engine SHALL support label.new(), label.set_*(), and label.delete() with dynamic modification.

#### Scenario: Label Creation
- **WHEN** label.new() is called
- **THEN** a new label SHALL be created

#### Scenario: Label Modification
- **WHEN** label.set_*() methods are called
- **THEN** the label properties SHALL be updated

#### Scenario: Label Delete
- **WHEN** label.delete() is called
- **THEN** the label SHALL be removed

#### Scenario: Text Placement
- **WHEN** label.set_text() is called
- **THEN** the label text SHALL be updated

#### Scenario: Tooltip Property
- **WHEN** label.new() includes the tooltip argument
- **THEN** the label SHALL display a tooltip on hover

### Requirement: Box Object Management
The engine SHALL support box.new(), box.set_*(), and box.delete().

#### Scenario: Box Creation
- **WHEN** box.new() is called with boundary coordinates
- **THEN** a new box SHALL be created

#### Scenario: Box Modification
- **WHEN** box.set_*() methods are called
- **THEN** the box properties SHALL be updated

#### Scenario: Box Delete
- **WHEN** box.delete() is called
- **THEN** the box SHALL be removed

### Requirement: Table Object Management
The engine SHALL support table.new(), table.cell(), and table.set_*() with dynamic content.

#### Scenario: Table Creation
- **WHEN** table.new() is called with position and dimensions
- **THEN** a new table SHALL be created

#### Scenario: Table Cell Content
- **WHEN** table.cell() is called with content
- **THEN** the table cell SHALL display the content

#### Scenario: Table Modification
- **WHEN** table.set_*() methods are called
- **THEN** the table properties SHALL be updated

### Requirement: Polyline Object Management
The engine SHALL support polyline.new() and polyline.delete() with line properties.

#### Scenario: Polyline Creation
- **WHEN** polyline.new() is called with points array
- **THEN** a new polyline SHALL be created

#### Scenario: Polyline Delete
- **WHEN** polyline.delete() is called
- **THEN** the polyline SHALL be removed
