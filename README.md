# Merge Party

WIP Automerge + Partykit.

Based on [automerge-repo-sync-server](https://github.com/automerge/automerge-repo-sync-server).

This creates 1 partykit room per document, using the automerge document ID as
the room name.

__STATUS__ &mdash;
Relay server works (2 browsers will sync data), but storage server does not.


<details><summary><h2>Contents</h2></summary>

<!-- toc -->

- [Develop](#develop)
  * [Start a relay server](#start-a-relay-server)
  * [Start a stateful server](#start-a-stateful-server)
- [Install](#install)
- [Use](#use)
  * [Backend](#backend)
  * [Browser Client](#browser-client)
- [Modules](#modules)

<!-- tocstop -->

</details>

## Develop

### Start a relay server

```sh
npm start
```

### Start a stateful server

```sh
npm run start:storage
```

--------------------------------------------

## Install

```sh
npm i -S @substrate-system/mergeparty
```

## Use

Create a backend (the websocket/partykit server) and a browser client.

### Backend

Need to export a class that extends the `MergeParty` class from this
module.

See [./example_backend](./example_backend/).

```js
import { MergeParty, CORS } from '@substrate-system/mergeparty/server'

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

See [./example/](./example/) for the browser version.

This is a small wrapper around [@automerge/automerge-repo-network-websocket](https://github.com/automerge/automerge-repo/tree/main/packages/automerge-repo-network-websocket),
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
>


#### Browser Example

Create a new in-browser automerge node.

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

## Modules

This exposes ESM and common JS via
[package.json `exports` field](https://nodejs.org/api/packages.html#exports).
