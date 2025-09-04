// src/server/with-storage.ts
import type * as Party from 'partykit/server'
import {
    Repo,
    type StorageAdapterInterface,
    type StorageKey,
} from '@substrate-system/automerge-repo-slim'
import Debug from '@substrate-system/debug/cloudflare'
import { decode as cborDecode } from 'cborg'
import { Relay } from './relay.js'
import './polyfill.js'  // need this for cloudflare environment

const debug = Debug('mergeparty:with-storage')

export class WithStorage
    extends Relay
    implements Party.Server, StorageAdapterInterface
{  // eslint-disable-line brace-style
    readonly isStorageServer:boolean = true  /* This is used by the relay,
      to decide if we should be announced as a peer. */
    _log:(msg:string)=>void
    _repo:Repo

    constructor (room:Party.Room, repo?:Repo) {
        super(room)

        if (!repo) {
            this._repo = new Repo({
                storage: this,
                network: [this],
                // Allow sharing documents - server accepts new documents from clients
                sharePolicy: async () => {
                    // Always accept and request documents from any connected peer
                    return true
                },
                // Set a stable peer ID for the server
                peerId: `server:${this.room.id}` as any,
            })
        } else {
            // repo should already have a network adapter added
            this._repo = repo
        }

        // Set up event-driven storage persistence
        this.setupStoragePersistence()

        this._log = Debug(
            'mergeparty:storage',
            this.room.env as Record<string, string>
        )

        // Initialize the network adapter connection since the repo should call connect on us
        // The repo should call this automatically, but let's ensure it happens
        this.connect(this.serverPeerId as any, {})
    }

    async onMessage (
        raw:ArrayBuffer|string,
        conn:Party.Connection
    ):Promise<void> {
        if (!this.byConn.get(conn)?.joined) {
            // has not joined yet
            return super.onMessage(raw, conn)
        }

        // Check if this is a sync message for a new document
        try {
            if (raw instanceof ArrayBuffer) {
                const decoded = cborDecode(new Uint8Array(raw))
                if (decoded && decoded.type === 'sync' && decoded.documentId) {
                    const documentId = decoded.documentId

                    // Check if we already have this document
                    const existingHandle = this._repo.handles[documentId]
                    if (!existingHandle) {
                        // Create a handle for this document so the repo knows
                        // about it
                        // This will trigger the sync process where the
                        // server requests the document
                        this._repo.find(documentId)
                    }
                }
            }
        } catch (_e) {
            // If we can't decode the message, just continue with normal processing
        }

        // Feed the frame to the repo via Relay
        // this should automatically handle storage
        await super.onMessage(raw, conn)
    }

    /**
     * Loads a value from PartyKit storage by key.
     * @param {StorageKey} key The storage key
     * @returns {Promise<Uint8Array|undefined>}
     */
    async load (key:StorageKey):Promise<Uint8Array|undefined> {
        const keyStr = this.keyToString(key)
        this._log(`Loading from storage: key=${keyStr}`)

        const value = await this.room.storage.get(keyStr)
        if (!value) {
            this._log(`No value found for key: ${keyStr}`)
            return
        }

        this._log(`Found value for key: ${keyStr}, type=${typeof value}`)

        if (value instanceof Uint8Array) return value
        if (value instanceof ArrayBuffer) return new Uint8Array(value)
        if (
            typeof value === 'object' && value !== null &&
            Object.keys(value).every(k => !isNaN(Number(k)))
        ) {
            return new Uint8Array(Object.values(value))
        }
        throw new Error('Unsupported value type from storage')
    }

    /**
     * Saves a value to PartyKit storage by key.
     * @param {StorageKey} key The storage key
     * @param {Uint8Array} value The value to store (Uint8Array)
     */
    async save (key:StorageKey, value:Uint8Array):Promise<void> {
        const keyStr = this.keyToString(key)
        this._log(`Saving to storage: key=${keyStr}, valueLength=${value.length}`)

        await this.room.storage.put(keyStr, value)
        this._log(`Successfully saved key: ${keyStr}`)
    }

    /**
     * Removes a value from PartyKit storage by key.
     * @param key The storage key
     */
    async remove (key:StorageKey):Promise<void> {
        await this.room.storage.delete(this.keyToString(key))
    }

    /**
     * Loads a range of values from PartyKit storage by prefix.
     * @param prefix The key prefix
     * @returns {Promise<{ key:StorageKey, data:Uint8Array|undefined }[]>}
     */
    async loadRange (prefix:StorageKey):Promise<{
        key:StorageKey;
        data:Uint8Array | undefined;
    }[]> {
        const key = this.keyToString(prefix)
        const entries:{ key:StorageKey, data:Uint8Array | undefined }[] = []
        const map = await this.room.storage.list({ prefix: key })

        for (const [k, v] of [...map.entries()].sort(([a], [b]) => {
            return a.localeCompare(b)
        })) {
            let u8:Uint8Array | undefined
            if (v instanceof Uint8Array) u8 = v
            else if (v instanceof ArrayBuffer) u8 = new Uint8Array(v)
            else if (
                typeof v === 'object' &&
                v !== null &&
                Object.keys(v).every(k => !isNaN(Number(k)))
            ) {
                u8 = new Uint8Array(Object.values(v))
            } else {
                u8 = undefined
            }

            entries.push({ key: this.stringToKey(k), data: u8 })
        }

        return entries
    }

    /**
     * Removes a range of values from PartyKit storage by prefix.
     * @param prefix The key prefix
     */
    async removeRange (prefix:StorageKey):Promise<void> {
        const key = this.keyToString(prefix)
        const map = await this.room.storage.list({ prefix: key })
        for (const key of map.keys()) {
            await this.room.storage.delete(key)
        }
    }

    async onStart ():Promise<void> {
        debug('**Stateful sync server started (Automerge peer w/' +
            ' PartyKit storage)**')

        // Store the storage adapter ID to ensure storage is initialized
        await this.save(['storage-adapter-id'], new TextEncoder().encode(this.peerId || 'server'))
        this._log('Storage adapter initialized')
    }

    // HTTP endpoints
    async onRequest (req:Party.Request):Promise<Response> {
        const url = new URL(req.url)

        // Debug endpoint to view storage contents
        if (url.pathname.includes('/debug/storage')) {
            const storageMap = await this.room.storage.list()
            const result:Record<string, any> = {}
            for (const [key, value] of storageMap) {
                result[key] = value
            }
            return Response.json(result, {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            })
        }

        // Test endpoint to verify storage functionality
        if (url.pathname.includes('/test/storage')) {
            debug('[WithStorage] Storage test endpoint called')
            try {
                debug('[WithStorage] Starting basic storage operations test...')

                // Test basic storage operations (this works immediately)
                const testKey = 'test-manual-storage'
                const testValue = new TextEncoder().encode('test-value')

                debug('[WithStorage] Calling save...')
                await this.save([testKey], testValue)
                debug('[WithStorage] Calling load...')
                const retrieved = await this.load([testKey])

                if (!retrieved || new TextDecoder().decode(retrieved) !== 'test-value') {
                    throw new Error('Storage test failed')
                }

                debug('[WithStorage] Basic storage operations successful')

                // Get repo state for debugging - be very careful here
                debug('[WithStorage] Storage test: getting repo handles...')
                let totalHandles = 0
                let readyHandles = 0
                let handleIds: string[] = []

                try {
                    handleIds = Object.keys(this._repo.handles)
                    totalHandles = handleIds.length
                    debug(`[WithStorage] Found ${totalHandles} handles`)

                    if (totalHandles > 0) {
                        const handles = Object.values(this._repo.handles)
                        debug('[WithStorage] Checking readiness of handles...')
                        readyHandles = handles.filter(handle => {
                            try {
                                return handle.isReady()
                            } catch (e: any) {
                                debug('[WithStorage] Error checking handle' +
                                    ` readiness: ${e.message}`)
                                return false
                            }
                        }).length
                    }
                } catch (e: any) {
                    debug(`[WithStorage] Error accessing repo handles: ${e.message}`)
                }

                debug(`[WithStorage] Storage test: found ${totalHandles}` +
                    ` total handles, ${readyHandles} ready`)

                return Response.json({
                    success: true,
                    message: 'Storage operations successful ' +
                        '- Automerge handles persistence automatically',
                    repoHandles: handleIds,
                    readyHandles,
                    totalHandles,
                    storageKeys: await this.room.storage.list().then(map => {
                        return [...map.keys()]
                    })
                }, {
                    status: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type'
                    }
                })
            } catch (error: any) {
                debug(`[WithStorage] Storage test failed: ${error.message}`)
                return Response.json({
                    success: false,
                    error: error.message
                }, {
                    status: 500,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type'
                    }
                })
            }
        }

        // Fall back to parent implementation for health checks
        return super.onRequest(req)
    }

    async onConnect (conn:Party.Connection):Promise<void> {
        // Call parent onConnect first
        super.onConnect(conn)

        // Trigger a flush when a new client connects to ensure
        // any existing documents are available
        try {
            await this._repo.flush()
            this._log('Flushed on client connect')
        } catch (e) {
            this._log(`Failed to flush on connect: ${e}`)
        }
    }

    private extractDocumentId (_conn: Party.Connection): string | null {
        // For now, we'll determine the document ID from sync messages
        // This will be implemented when we receive the first sync message
        return null
    }

    protected unicastByPeerId (peerId:string, data:Uint8Array) {
        const conn:Party.Connection|undefined = this.sockets[peerId]
        if (conn) conn.send(data)
    }

    private keyToString (key:string[]):string {
        return key.join('.')
    }

    private stringToKey (key:string):string[] {
        return key.split('.')
    }

    private setupStoragePersistence ():void {
        debug('[WithStorage] Setting up storage persistence ' +
            '- Automerge should handle this automatically')

        // Log repo state periodically for debugging
        setInterval(() => {
            const handleCount = Object.keys(this._repo.handles).length
            if (handleCount > 0) {
                const handles = Object.values(this._repo.handles)
                const readyHandles = handles.filter(handle => handle.isReady())
                debug(`[WithStorage] Repo state: ${handleCount}` +
                    ` total handles, ${readyHandles.length} ready`)
                debug(
                    '[WithStorage] Handle IDs:',
                    Object.keys(this._repo.handles)
                )
            }
        }, 5000)  // Log every 5 seconds for debugging
    }
}
