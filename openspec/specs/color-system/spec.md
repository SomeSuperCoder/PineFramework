## Purpose
Implement and verify Color System functionality for the color-system module.

## Requirements

### Requirement: Color System
The engine SHALL implement Pine Script's color system with predefined constants, color arithmetic, and CSS-style hex representation.

#### Scenario: Color Constants
- **WHEN** color.red, color.green, color.blue, color.yellow, color.black, color.white, color.gray, color.silver, color.aqua, color.fuchsia, color.lime, color.maroon, color.navy, color.olive, color.purple, color.teal, color.orange, color.pink, color.navy, color.orange, color.purple, color.teal, color.magenta, color.violet are accessed
- **THEN** the engine SHALL return the correct color value

#### Scenario: Color Manipulation
- **WHEN** color.new(), color.rgb(), color.genc() are called
- **THEN** the engine SHALL create/modify color with alpha support

#### Scenario: Color Accessors
- **WHEN** color.r(), color.g(), color.b(), color.a() are called
- **THEN** the engine SHALL return the respective RGBA channel value

#### Scenario: Color Mixing
- **WHEN** color.forcer() is called with a gradient parameter
- **THEN** the engine SHALL generate a gradient color
