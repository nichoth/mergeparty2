// src/server/with-storage.ts
import type * as Party from 'partykit/server'
import {
    type AnyDocumentId,
    type Message,
    Repo,
    type StorageAdapterInterface,
    type StorageKey,
} from '@substrate-system/automerge-repo-slim'
import { Relay } from './relay.js'

export class WithStorage
    extends Relay
    implements Party.Server, StorageAdapterInterface
{  // eslint-disable-line brace-style
    readonly isStorageServer:boolean = true  /* This is used by the relay,
      to decide if we should be announced as a peer. */

    constructor (room:Party.Room) {
        super(room)

        /**
         * The Relay class will add itself as a network adapter when
         * you set `._repo`.
         */
        this._repo = new Repo({
            storage: this,
            sharePolicy: async () => true,
        })
    }

    // /**
    //  * Get the sync state for a given peer ID.
    //  */
    // private stateFor (peerId:string):SyncState {
    //     let st = this.syncStateByPeer[peerId]
    //     if (!st) {
    //         st = initSyncState()
    //         this.syncStateByPeer[peerId] = st
    //     }

    //     return st
    // }

    async onMessage (
        raw:ArrayBuffer|string,
        conn:Party.Connection
    ):Promise<void> {
        if (!this.byConn.get(conn)?.joined) {
            // has not joined yet
            return super.onMessage(raw, conn)
        }

        // 1) Feed the frame to the repo via Relay
        await super.onMessage(raw, conn)

        // 2) Ensure the relevant handle is ready, then flush
        await this.safeFlush(raw)
    }

    /**
     * Loads a value from PartyKit storage by key.
     * @param {StorageKey} key The storage key
     * @returns {Promise<Uint8Array|undefined>}
     */
    async load (key:StorageKey):Promise<Uint8Array|undefined> {
        const value = await this.room.storage.get(this.keyToString(key))
        if (!value) return
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
        // Use .buffer, but slice to correct offset/length
        const buf = ((
            value.byteOffset === 0 &&
            value.byteLength === value.buffer.byteLength
        ) ?
            value.buffer :
            value.slice().buffer)

        await this.room.storage.put(this.keyToString(key), buf)
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
     * @returns {Promise<{ key:StorageKey, value:Uint8Array }[]>}
     */
    async loadRange (prefix:StorageKey):Promise<{
        key:StorageKey;
        data:Uint8Array;
    }[]> {
        const key = this.keyToString(prefix)
        const entries:{ key:StorageKey, data:Uint8Array }[] = []
        const map = await this.room.storage.list({ prefix: key })

        for (const [k, v] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            let u8:Uint8Array
            if (v instanceof Uint8Array) u8 = v
            else if (v instanceof ArrayBuffer) u8 = new Uint8Array(v)
            else if (
                typeof v === 'object' &&
                v !== null &&
                Object.keys(v).every(k => !isNaN(Number(k)))
            ) {
                u8 = new Uint8Array(Object.values(v))
            } else {
                continue
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

    onStart ():void {
        console.log('**Stateful sync server started (Automerge peer w/' +
            ' PartyKit storage)**')
    }

    // --- Helpers ---

    private async safeFlush (raw:ArrayBuffer|string) {
        // We only care about binary protocol frames
        if (!(raw instanceof ArrayBuffer)) return

        // Best-effort decode so we can branch on type & docId
        let msg:Message|undefined
        try { msg = this.cborDecode<Message>(raw) } catch { return }
        const docId = msg?.documentId as AnyDocumentId|undefined
        if (!docId) return

        // Register interest so the repo tracks this doc (non-blocking)
        try { this._repo.find(docId) } catch {}

        // 2) Only try to persist on 'sync' (a 'request' carries no bytes)
        if (msg.type !== 'sync') return

        // Flush; ignore the two first-contact races
        try {
            await this._repo.flush()
        } catch (e: any) {
            const m = String(e?.message || '')
            if (
                /DocHandle is not ready/i.test(m) ||
                /Document .* is unavailable/i.test(m)
            ) {
                return  // handle still warming up; skip this cycle
            }
            throw e
        }
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
}
