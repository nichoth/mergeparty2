# Merge Party

WIP Automerge + Partykit.

Based on [automerge-repo-sync-server](https://github.com/automerge/automerge-repo-sync-server).

This creates 1 partykit room per document, using the automerge document ID as
the room name.

Since we are using [Partykit](https://www.partykit.io/), everything is tied to
the lifecycle of the websocket server. So we create a
[Repo](https://github.com/automerge/automerge-repo/tree/main) as part of
constructing the websocket server.


<details><summary><h2>Contents</h2></summary>

<!-- toc -->

- [Install](#install)
- [Storage](#storage)
- [Relay](#relay)
- [Use](#use)
  * [Backend](#backend)
  * [Browser Client](#browser-client)
- [Develop](#develop)
  * [Manually test the storage server](#manually-test-the-storage-server)
  * [Manually test the Relay server](#manually-test-the-relay-server)
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

The `@substrate-system/mergeparty/server/storage` path exports a class
`WithStorage`, that is a Partykit server that implements the
[Storage Adapter interface](https://github.com/automerge/automerge-repo/blob/0c791e660723d8701a817c02d88bed4bf249b588/packages/automerge-repo/src/storage/StorageAdapterInterface.ts)
as well as the
[Network Adapter](https://github.com/automerge/automerge-repo/blob/main/packages/automerge-repo/src/network/NetworkAdapter.ts)
interface.

Automerge handles document persistence automatically as part of the Repo's
built-in storage subsystem. The Repo calls the Storage Adapter when
it needs to save or load a document. This library creates the API
expected by the Repo.

Automerge expects a key/value storage interface with the methods
`load`, `save`, `remove`, `loadRange`, and `removeRange`. The keys are arrays of
strings (`StorageKey`) and values are binary blobs (`Uint8Array`).

When a sync message delivers a new change, the repo updates the doc and then
invokes the storage adapter to persist it.

## Relay

Just sync documents, or relay messages, between different peers.

The `@substrate-system/mergeparty/server/relay` path exports a class `Relay`,
that is a Network Adapter. It just relays messages between peers.

The Newtork Adapter emits a set of messages that the Repo listens for.

* `peer-candidate` - tells the repo “I found another peer, do you want
  to connect?”
* `message` - delivers a raw message from another peer to the repo.
* `close` / `peer-disconnected` - lifecycle events.

The Repo call the network adapter’s `send()` function to deliver messages.


## Use

Create a backend (the websocket/partykit server) and a browser client.

See [./example](./example/).

### Backend

Your application needs to export a class that extends either the `Relay`
class or the `WithStorage ` class.

See [./example_backend](./example_backend/).

```js
import type * as Party from 'partykit/server'
import { WithStorage } from '@substrate-system/mergeparty/server/relay'
import { CORS } from '@substrate-system/server'

export default class StorageExample
  extends WithStorage
  implements Party.Server
{
    static async onBeforeConnect (request:Party.Request, _lobby:Party.Lobby) {
      // auth goes here

      return request
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

### Manually test the storage server

Start the storage backend:

```sh
npm run start:storage
```

Then open a browser to `localhost:8888`. Connect, and write something in the
text box. Copy the document ID to the clipboard, then refresh the page.
Delete eveything from indexed DB, then paste the document ID into the input
and connect to the server again. You should see the same text re-appear in
the textarea.

The **Partykit config** is in `example_backend/partykit-storage.json`.

The **server** itself is `example_backend/with-storage.ts`


------------------------------------------------------------------


### Manually test the Relay server

Start the servers:

```sh
npm start
```

The open two browser windows to `localhost:8888`. Connect in the first window.
Copy the document ID that was created, and then paste it into the input
in browser window 2.

Write some text into either textarea. You should see the same text appear in
the other browser.

The **Partykit config** for the Relay server is
in `example_backend/partykit-relay.json`.

The **server** itself is `example_backend/relay.ts`


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
