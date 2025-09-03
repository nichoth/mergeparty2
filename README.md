# Merge Party

WIP Automerge + Partykit.

Based on [automerge-repo-sync-server](https://github.com/automerge/automerge-repo-sync-server).

This creates 1 partykit room per document, using the automerge document ID as
the room name.

<details><summary><h2>Contents</h2></summary>

<!-- toc -->

- [Install](#install)
- [Use](#use)
  * [Backend](#backend)
  * [Browser Client](#browser-client)
- [Develop](#develop)
  * [Example Servers](#example-servers)
  * [Development Workflow](#development-workflow)
- [Test](#test)
  * [Storage Unit Tests](#storage-unit-tests)
  * [Storage Tests](#storage-tests)
  * [Integration Tests (End-to-End)](#integration-tests-end-to-end)
  * [Relay Tests](#relay-tests)
  * [All Tests](#all-tests)

<!-- tocstop -->

</details>

## Install

```sh
npm i -S @substrate-system/mergeparty
```

## Storage

Automerge handles document persistence automatically as part of the Repo's
built-in storage subsystem. This library creates the API expected by the Repo.

Automerge expects a key/value storage interface with the methods
`load`, `save`, `remove`, `loadRange`, and `removeRange`. The keys are arrays of
strings (`StorageKey`) and values are binary blobs (`Uint8Array`).

## Relay

Official Automerge sync server uses:

* sharePolicy: `async () => false` (don't proactively share documents)
* Documents are only loaded when explicitly requested by clients

## Use

Create a backend (the websocket/partykit server) and a browser client.

### Backend

Your application needs to export a class that extends the `MergeParty` class
from this module.

See [./example_backend](./example_backend/).

```js
import { CORS } from '@substrate-system/server'
import { Relay } from '@substrate-system/mergeparty/server/relay'

export default class ExampleServer extends MergeParty {
  static async onBeforeConnect (request:Party.Request, _lobby:Party.Lobby) {
    // auth goes here
  }
}
```

#### HTTP

You can make HTTP calls to the server:

```
http://localhost:1999/parties/main/<document-id-here>
```

You should see a response

```
👍 All good
```

##### `/health`

```
http://localhost:1999/parties/main/<document-id-here>/health
```

Response:

```js
{
  "status": "ok",
  "room": "my-document-id",
  "connectedPeers": 0
}
```

##### `/debug/storage`

Show what the server has saved in storage.

```
http://localhost:1999/parties/main/<document-id-here>/debug/storage
```

### Browser Client

See [./example/index.ts](./example/index.ts) for the browser version.

This is a small wrapper around
[@automerge/automerge-repo-network-websocket](https://github.com/automerge/automerge-repo/tree/main/packages/automerge-repo-network-websocket),
just adding some parameters for partykit.

```ts
export class PartykitNetworkAdapter extends WebSocketClientAdapter {
    constructor (options:{
      host?:string
      room:string
      party?:string
    })
```

> 
> [!IMPORTANT]  
> Automerge repo doesn't automatically persist changes to IndexedDB,
> so add an explicit `repo.flush()` call after each document change.
> See [./example/state.ts](./example/state.ts#L215)
>

#### Browser Example

Create a new automerge node in a web browser. It uses
[indexedDB](https://github.com/automerge/automerge-repo/tree/main/packages/automerge-repo-storage-indexeddb)
as storage.

```ts
import {
    IndexedDBStorageAdapter
} from '@automerge/automerge-repo-storage-indexeddb'
import { PartykitNetworkAdapter } from '@substrate-system/merge-party/client'

const repo = new Repo({
    storage: new IndexedDBStorageAdapter(),
})

const doc = repo.create({ text: '' })
documentId = doc.documentId

// use the document ID as the room name
const networkAdapter = new PartykitNetworkAdapter({
    host: PARTYKIT_HOST,
    room: documentId
})

repo.networkSubsystem.addNetworkAdapter(networkAdapter)
await networkAdapter.whenReady()

// ... use the repo ...
```


## Develop

### Example Servers

You can start two different types of server, Relay or Storage.

#### Start a relay server (stateless)

```sh
npm start
```

Start a simple relay server that forwards messages between clients; does not
persist messages. Includes a Vite dev server for the browser example.
Start the server, then visit `localhost:8888` to see the frontend.

The **Partykit config** is in `example_backend/partykit-relay.json`.

The **server** itself is `example_backend/relay.ts`


#### Start a stateful storage server

```sh
npm run start:storage
```

Start a server with persistent storage using PartyKit's storage backend.
Documents persist across connections. Start the backend & vite, then visit
`localhost:8888`.

The **Partykit config** is in `example_backend/partykit-storage.json`.

The **server** itself is `example_backend/with-storage.ts`


#### Start servers for testing (no Vite)

```sh
# Relay server only (port 1999)
npm run start:relay:test

# Storage server only (port 1999)  
npm run start:storage:test
```

### Development Workflow

Manual testing:

```sh
npm run start:storage  # Start server + browser dev
```


## Test

### Storage Unit Tests

Test the storage interface in isolation, with mocked PartyKit storage.
This is faster than integration tests, has no external dependencies, and
produces deterministic results.

```sh
npm run test:storage
```


### Storage Tests

Test that documents are stored by the server via the HTTP endpoints.

- Start PartyKit storage server
- Test document creation and persistence
- Verify storage via debug endpoints
- Clean up processes properly
- Exit cleanly with pass/fail results

```sh
npm run test:storage:persistence
```


### Integration Tests (End-to-End)

Test a real PartyKit storage server with real network communication.

```sh
npm run test:integration
```

### Relay Tests

Test basic relay server functionality without persistence.

```sh
npm run test:relay
```

### All Tests

Run all tests in sequence - unit tests, storage persistence tests,
and relay tests

```sh
npm test
```
