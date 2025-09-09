import type { PartySocket } from 'partysocket'
import {
    IndexedDBStorageAdapter
} from '@automerge/automerge-repo-storage-indexeddb'
import { type Signal, signal } from '@preact/signals'
import { decode } from '@substrate-system/automerge-repo-slim/helpers/cbor.js'
import {
    type DocHandle,
    Repo
} from '@substrate-system/automerge-repo-slim'
import Debug from '@substrate-system/debug'
import { type AnyDocumentId } from '@automerge/automerge-repo'
import {
    PartykitNetworkAdapter
} from '../src/client/partykit-websocket-adapter.js'

const debug = Debug('mergeparty:state')

export const PARTYKIT_HOST:string = (import.meta.env.DEV ?
    'http://localhost:1999' :
    'https://merge-party.nichoth.partykit.dev')

export type ServerType = 'relay' | 'storage'
export type Status = 'connecting'|'connected'|'disconnected'

export type AppDoc = {
    text: string
}

export type ExampleAppState = {
    repo:Repo;
    status:Signal<Status>;
    document:Signal<DocHandle<AppDoc>|null>;
    party:PartySocket|null;
    serverType:Signal<ServerType>;
}

export function State ():ExampleAppState {
    // Create repo without network adapter, so it doesn't
    // connect automatically
    const storage = new IndexedDBStorageAdapter()
    const repo = new Repo({ storage })

    // Determine server type from URL or environment
    const defaultServerType: ServerType =
        (import.meta.env.VITE_SERVER_TYPE as ServerType) ||
        (new URLSearchParams(window.location.search).get('server') as ServerType) ||
        'relay'

    return {
        repo,
        document: signal(null),
        status: signal('disconnected'),
        party: null,
        serverType: signal(defaultServerType)
    }
}

State.disconnect = function (state:ReturnType<typeof State>) {
    const adapters = state.repo.networkSubsystem.adapters
    adapters.forEach(adapter => {
        if (adapter instanceof PartykitNetworkAdapter) {
            adapter.disconnect()
        }
    })

    // Update status
    state.status.value = 'disconnected'
    state.party = null
}

/**
 * Use 1 partykit room per document.
 *
 * Once we connect to the room, then find the document by ID.
 */
State.connect = async function (
    state:ReturnType<typeof State>,
    documentId?:AnyDocumentId
):Promise<PartySocket|null> {
    const repo = state.repo
    const serverType = state.serverType.value

    // If no document ID provided, create a new document
    if (!documentId) {
        const doc = State.createDoc(state)
        documentId = doc.documentId
    }

    try {
        // Use the document ID to create a partykit room with the selected server type
        const networkAdapter = new PartykitNetworkAdapter({
            host: PARTYKIT_HOST,
            room: documentId as string,
            party: serverType // Use the selected party type
        })

        repo.networkSubsystem.addNetworkAdapter(networkAdapter)

        // Set status to connecting when we start waiting for connection
        state.status.value = 'connecting'

        // Wait for the network adapter
        debug('waiting for network adapter...')
        await networkAdapter.whenReady()

        debug('network adapter ready!')
        state.status.value = 'connected'

        // Now that network is connected, try to find/load the document
        debug('Attempting to find document from server:', documentId)

        try {
            const doc = await repo.find<AppDoc>(documentId as AnyDocumentId)

            // Wait for it to be ready (this triggers network sync)
            debug('Waiting for document to be ready...')
            await doc.whenReady()

            state.document.value = doc
            debug('Document is ready, content:', doc.doc())
        } catch (error) {
            const err = error as Error
            debug('Could not find/load document', documentId, err.message)

            // If document doesn't exist anywhere, create a new one with this ID
            debug('Creating new document with ID:', documentId)
            const doc = repo.create<AppDoc>({ text: '' })
            state.document.value = doc
            debug('Created new document:', doc.documentId)
        }

        const party = networkAdapter.socket as PartySocket
        if (!party) throw new Error('no socket available')

        state.party = party

        party.addEventListener('message', ev => {
            if (ev.data instanceof ArrayBuffer) {
                debug('Message size:', ev.data.byteLength, 'bytes')
                debug('Repo handles after message:', Object.keys(repo.handles))
                debug('got a message', decode(new Uint8Array(ev.data)))
            }
        })

        party.addEventListener('close', () => {
            debug('websocket is closed')
            state.status.value = 'disconnected'
        })

        party.addEventListener('error', (error) => {
            debug('websocket error:', error)
            state.status.value = 'disconnected'
        })

        return party
    } catch (error) {
        debug('Connection error:', error)
        state.status.value = 'disconnected'
        return null
    }
}

/**
 * Create a new document, set in state, return the doc handle.
 *
 * @param state The state object
 * @returns The document "handle".
 */
State.createDoc = function (state:ReturnType<typeof State>):DocHandle<AppDoc> {
    const repo = state.repo
    // Create the document to get its ID
    const docHandle = repo.create({ text: '' })

    state.document.value = docHandle
    return docHandle
}

/**
 * Need to call .flush on the repo.
 */
State.updateDoc = async function (
    state:ExampleAppState,
    newValue:string
):Promise<DocHandle<AppDoc>> {
    const data = state.document.value
    if (!data) {
        debug('No document available for input')
        throw new Error('No document available for input')
    }

    // Update the automerge document
    data.change((d) => {
        d.text = newValue
        return d
    })

    // Force the repo to save the document
    await state.repo.flush()

    return data
}
