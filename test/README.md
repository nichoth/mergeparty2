# Testing Server-Side Storage

This directory contains tests for PartyKit + server-side storage.


## Approach 1: Unit Tests (storage.test.ts)

Mock the PartyKit storage interface and test the `WithStorage` class directly
without requiring a real PartyKit server or browser clients.

**Advantages:**
- Fast execution
- No external dependencies
- Reliable and deterministic
- Tests the storage interface in isolation

```bash
npm run test:storage
```

## Approach 2: Integration Tests (storage-integration.test.ts)

These tests create a real PartyKit server and test the full storage
workflow including:

- Document persistence across connections
- Multiple repo instances connecting to the same room
- HTTP debug endpoints

__Advantages__

- Tests the real PartyKit environment
- Verifies end-to-end functionality
- Tests actual network communication and storage persistence

__Requirements__

- PartyKit CLI must be available (`npx partykit`)
- Port 1999 must be available

```bash
npm run test:integration
```

## Test Scenarios Covered

### Storage Interface Testing

- Save and load binary data
- Key serialization (arrays to dot-separated strings)
- Range operations (loadRange, removeRange)
- Data removal
- Non-existent key handling

### Integration Testing

- Document creation and persistence
- Cross-connection document retrieval
- Server storage acting as persistence layer
- Debug endpoint functionality

## Understanding the Storage Flow

1. **Document Creation**: A client creates an Automerge document and
   makes changes
2. **Storage Persistence**: The `WithStorage` server saves document chunks
   to PartyKit storage
3. **Connection Disconnect**: The original client disconnects
4. **New Connection**: A new client connects to the same room
5. **Document Retrieval**: The new client requests the document by ID
6. **Storage Lookup**: The server loads the document from PartyKit storage
7. **Document Sync**: The document is sent to the new client

## Debugging

The integration tests include a debug endpoint that shows all stored data:

```
GET /parties/main/{roomId}/debug/storage
```

This returns a JSON object with all storage keys and their values for debugging purposes.

## Common Issues

1. **Server startup timeout**: The integration tests wait for the PartyKit
   server to start. If tests fail, check that PartyKit CLI is installed and port
   1999 is available.
2. **Document not persisting**: If documents aren't persisting across
   connections, check:

   - The `safeFlush` method is being called
   - Storage operations are completing successfully
   - Network connectivity between client and server

3. **Test flakiness**: Integration tests may be flaky due to timing. The tests
   include generous timeouts, but you may need to adjust them based on your
   system performance.
