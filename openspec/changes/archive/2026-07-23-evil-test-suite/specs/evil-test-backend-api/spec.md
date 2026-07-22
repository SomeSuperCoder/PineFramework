## ADDED Requirements

### Requirement: Backend API rejects oversized/malformed payloads
The backend API routes SHALL reject requests with oversized or malformed payloads with appropriate HTTP 4xx status codes, not crash.

#### Scenario: Oversized POST body
- **WHEN** a POST request with a body exceeding the configured JSON body parser limit is sent
- **THEN** the server SHALL return 413 Payload Too Large or 400 Bad Request

#### Scenario: Malformed JSON body
- **WHEN** a request with invalid JSON body is sent
- **THEN** the server SHALL return 400 Bad Request

#### Scenario: Extremely long URL parameters
- **WHEN** a request with URL parameters exceeding reasonable length is sent
- **THEN** the server SHALL return 400 or 414 URI Too Long

#### Scenario: Unexpected binary data in body
- **WHEN** a request with binary/non-text data in the body field is sent
- **THEN** the server SHALL not crash; SHALL return 400

### Requirement: Backend API validates symbol and timeframe parameters
The backend SHALL reject invalid trading symbol or timeframe parameters with clear error messages.

#### Scenario: Empty symbol parameter
- **WHEN** a request with an empty symbol is sent
- **THEN** the server SHALL return an error indicating symbol is required

#### Scenario: Invalid timeframe
- **WHEN** a request with an unrecognized timeframe string is sent
- **THEN** the server SHALL return an error indicating timeframe is invalid

#### Scenario: Symbol with special characters
- **WHEN** a request with HTML-injecting symbol like `<script>alert(1)</script>` is sent
- **THEN** the server SHALL not execute the script; SHALL return an error about invalid symbol

#### Scenario: Extremely long symbol name
- **WHEN** a request with a symbol of 1000+ characters is sent
- **THEN** the server SHALL return an error about invalid symbol

### Requirement: Backend API handles concurrent requests without state corruption
The backend SHALL handle concurrent requests to mutable endpoints without corrupting shared state.

#### Scenario: Concurrent bar processing
- **WHEN** two concurrent requests attempt to process bars for the same symbol
- **THEN** the engine SHALL maintain state consistency

#### Scenario: Concurrent export requests
- **WHEN** multiple export requests arrive simultaneously
- **THEN** all exports SHALL complete without file corruption
