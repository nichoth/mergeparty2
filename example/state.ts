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
    'https://merge-party2.nichoth.partykit.dev')

export type Status = 'connecting'|'connected'|'disconnected'

export type AppDoc = {
    text: string
}

export type ExampleAppState = {
    repo:Repo;
    status:Signal<Status>;
    document:Signal<DocHandle<AppDoc>|null>;
    party:PartySocket|null;
}

// Create a custom storage adapter that logs save operations
export class DebugIndexedDBStorageAdapter extends IndexedDBStorageAdapter {
    async save (key: any, data: Uint8Array): Promise<void> {
        debug('IndexedDB save called for key:', key, 'data size:', data.length)
        return super.save(key, data)
    }

    async load (key:any):Promise<Uint8Array|undefined> {
        const result = await super.load(key)
        return result
    }
}

export function State ():ExampleAppState {
    // Create repo without network adapter, so it doesn't
    // connect automatically
    const storage = new IndexedDBStorageAdapter()
    const repo = new Repo({ storage })

    return {
        repo,
        document: signal(null),
        status: signal('disconnected'),
        party: null
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
    if (!documentId) {
        const doc = State.createDoc(state)
        documentId = doc.documentId
    } else {
        debug('a doc ID was passed in...', documentId)
        // document ID was passed in
        try {
            const handle = await state.repo.find<AppDoc>(documentId)
            state.document.value = handle
        } catch (_err) {
            const err = _err as Error
            debug('Document not found in local storage', documentId, err.message)
        }
    }

    // state.document.value?.on('change', ev => {
    //     debug('change event', ev)
    // })

    try {
        // may or may not have a local document

        // Use the document ID to create a partykit room
        const networkAdapter = new PartykitNetworkAdapter({
            host: PARTYKIT_HOST,
            room: documentId as string
        })

        repo.networkSubsystem.addNetworkAdapter(networkAdapter)

        // Set status to connecting when we start waiting for connection
        state.status.value = 'connecting'

        // Wait for the network adapter
        debug('waiting for network adapter...')
        await networkAdapter.whenReady()

        debug('network adapter ready!')
        state.status.value = 'connected'

        if (!state.document.value) {
            // do not have a local document
            debug("Don't have the document yet... so call .find ...")

            // Try to find the document using repo.find() which handles
            // network loading
            try {
                debug('Attempting to find document:', documentId)
                const doc = await repo.find<AppDoc>(documentId as AnyDocumentId)

                // Wait for it to be ready
                // (this will trigger network sync if needed)
                debug('Waiting for document to be ready...')
                await doc.whenReady()
                state.document.value = doc
                debug('Document is ready, content:', doc.doc())
            } catch (error) {
                const err = error as Error
                debug('Could not find document', documentId)
                debug(err.message)
            }
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
