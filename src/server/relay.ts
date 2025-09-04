import type * as Party from 'partykit/server'
import { encode as cborEncode, decode as cborDecode } from 'cborg'
import { EventEmitter } from 'eventemitter3'
import Debug, { type Debugger } from '@substrate-system/debug/cloudflare'
import {
    type NetworkAdapterEvents,
    type NetworkAdapter,
    type PeerId,
    type PeerMetadata,
} from '@substrate-system/automerge-repo-slim'
import {
    CORS,
    type BaseMsg,
    type PeerMessage,
    SUPPORTED_PROTOCOL_VERSION
} from './index.js'
import {
    type FromServerMessage,
    type FromClientMessage,
    type ProtocolVersion
} from '@substrate-system/automerge-repo-network-websocket'
import {
    isJoinMessage,
    type JoinMessage as JoinMsg,
} from '@substrate-system/automerge-repo-network-websocket/messages'
import {
    ProtocolV1
} from '@substrate-system/automerge-repo-network-websocket/protocolVersion'
import { toArrayBuffer, toU8, assert } from '../util.js'

const debug = Debug('mergeparty:relay')

/**
 * Relay-only server.
 *   - No storage; just routes messages between peers in the same room
 *   - Handshake: expect `join`, reply with `peer`
 *   - Messages: forward anything with a `targetId` to the mapped peer
 *
 * The network adapter does not know about the repo at all. It emits events
 * that the repo listens to.
 *
 * @event 'peer-candidate'
 * @event 'message'
 *
 * Based on {@link https://github.com/automerge/automerge-repo-sync-server|automerge-repo-sync-server|}
 * @see {@link https://github.com/substrate-system/automerge-repo-slim/blob/main/src/network/NetworkAdapterInterface.ts | NetworkAdapter interface}
 * @see {@link https://github.com/automerge/automerge-repo/blob/main/packages/automerge-repo-network-websocket/src/WebSocketServerAdapter.ts | Websocket server adapter}
 */
export class Relay
    extends EventEmitter
    implements NetworkAdapter, Party.Server
{  // eslint-disable-line brace-style
    readonly room:Party.Room
    readonly serverPeerId:string
    readonly isStorageServer:boolean = false
    peerId?:PeerId  // our peer ID
    peerMetadata?:PeerMetadata  // our peer metadata
    sockets:{ [peerId:PeerId]:Party.Connection } = {}
    _log:Debugger
    _baseLog:Debugger

    // Connection -> meta { peerId?:string, joined:boolean }
    protected byConn = new Map<Party.Connection, {
        peerId?:string;
        joined:boolean
    }>()

    constructor (room:Party.Room) {
        super()
        this.room = room
        // Use a deterministic server peer id per room so clients can address
        // the server if they want
        this.serverPeerId = `server:${room.id}`
        this._baseLog = Debug('mergeparty')
        this._log = this._baseLog.extend('relay')  // mergeparty:relay
    }

    listenerCount<T extends keyof NetworkAdapterEvents> (
        _event:T
    ):number {
        return 0
    }

    eventNames ():(keyof NetworkAdapterEvents)[] {
        type EventKeys = keyof NetworkAdapterEvents
        const eventKeys = [
            'close',
            'peer-candidate',
            'peer-disconnected',
            'message',
        ] as const satisfies EventKeys[]

        return eventKeys
    }

    // --- NetworkAdapterInterface required methods ---

    isReady ():boolean {
        return true
    }

    /**
     * Called by the Repo to start things.
     * @param {PeerId} peerId The peerId of *this repo*.
     * @param {PeerMetadata} meta How this adapter should present itselft
     *        to other peers.
     */
    connect (peerId:PeerId, meta:PeerMetadata):void {
        this.peerId = peerId
        this.peerMetadata = meta
    }

    disconnect ():void {
        // obsolete in partykit
    }

    send (message:FromServerMessage):void {
        if ('data' in message && message.data?.byteLength === 0) {
            throw new Error('Tried to send a zero-length message')
        }

        // const senderId = this.peerId
        // if (!senderId) throw new Error('Not senderId')
        // const socket = this.room.getConnection(senderId)
        const to = this.sockets[message.targetId as string]
        if (!to) {
            this._log(`Tried to send to disconnected peer: ${message.targetId}`)
            return
        }

        const encoded = cborEncode(message)
        to.send(toArrayBuffer(encoded))
    }

    open ():void {}
    close ():void {}
    subscribe ():void {}
    unsubscribe ():void {}

    get networkId ():string {
        return this.room.id
    }

    // Abstract method from NetworkAdapter
    whenReady ():Promise<void> {
        return Promise.resolve()
    }

    // ---- WebSocket lifecycle ----

    onConnect (conn:Party.Connection) {
        this.byConn.set(conn, { joined: false })
    }

    onClose (conn:Party.Connection) {
        const meta = this.byConn.get(conn)
        if (meta?.peerId) {
            delete this.sockets[meta.peerId]
        }
        this.byConn.delete(conn)
        this.emit('peer-disconnected', {
            peerId: this.byConn.get(conn)?.peerId
        })
    }

    protected cborEncode (data:Record<any, any>) {
        return cborEncode(data)
    }

    protected cborDecode<T=any> (raw:ArrayBuffer):T {
        return cborDecode(toU8(raw))
    }

    /**
     * Decode CBOR messages.
     * This handles 'join' + handshake process.
     * Emits `peer-candidate` and `message` events.
     *
     * @fires peer-candidate
     * @fires message
     */
    async onMessage (raw:ArrayBuffer|string, conn:Party.Connection) {
        debug('[Relay] Received message from client')

        if (typeof raw === 'string') {
            this.sendErrorAndClose(
                conn,
                'Expected binary CBOR frame, got string'
            )
            return
        }

        let message:FromClientMessage
        try {
            message = cborDecode(toU8(raw))
        } catch (_err) {
            const err = _err as Error
            console.error(err.message)
            conn.close()
            return
        }

        const meta = this.byConn.get(conn) ?? { joined: false }

        // --- Handshake: first message must be `join` ---
        if (!meta.joined) {
            if (!isJoinMessage(message)) {
                // emit message and stop
                // this follows the automerge websocket server protocol
                // https://github.com/automerge/automerge-repo/blob/0c791e660723d8701a817c02d88bed4bf249b588/packages/automerge-repo-network-websocket/src/WebSocketServerAdapter.ts#L71

                /**
                 * @see {@link https://github.com/automerge/automerge-repo/blob/0c791e660723d8701a817c02d88bed4bf249b588/packages/automerge-repo-network-websocket/src/WebSocketServerAdapter.ts#L178}
                 * If not a 'join' message, `this.emit('message', msg)`
                 */
                this.emit('message', message)
                return
            }

            // --- message is "join" type ---
            const join = message as JoinMsg
            const versions = join.supportedProtocolVersions ?? ['1']
            if (!versions.includes(SUPPORTED_PROTOCOL_VERSION)) {
                return this.sendErrorAndClose(
                    conn,
                    'Unsupported protocol version. ' +
                        `Server supports ${SUPPORTED_PROTOCOL_VERSION}`
                )
            }

            if (!join.senderId || typeof join.senderId !== 'string') {
                this.sendErrorAndClose(conn, '`senderId` missing or invalid')
                return
            }

            // ---------- message is valid join type ----------

            const { senderId, peerMetadata, supportedProtocolVersions } = join
            // Let the repo know that we have a new connection.
            this.emit('peer-candidate', {
                peerId: senderId,
                peerMetadata,
            })
            this.sockets[senderId] = conn

            // map peerID to connection
            this.sockets[join.senderId] = conn
            // connection to peerID
            this.byConn.set(conn, { joined: true, peerId: join.senderId })

            const selectedProtocolVersion = selectProtocol(supportedProtocolVersions)
            if (selectedProtocolVersion === null) {
                // invalid protocol version
                this.send({
                    type: 'error',
                    senderId: this.peerId!,
                    message: 'unsupported protocol version',
                    targetId: senderId,
                })
                this.sockets[senderId].close()
                delete this.sockets[senderId]
            } else {
                // Tell the new person that this server is a peer.
                this.send({
                    type: 'peer',
                    senderId: this.peerId!,
                    peerMetadata: this.peerMetadata!,
                    selectedProtocolVersion: ProtocolV1,
                    targetId: senderId,
                })
            }

            // 1) Tell the new client about all existing peers
            // for (const existingId of this.peers.keys()) {
            for (const existingId of Object.keys(this.sockets)) {
                if (existingId === join.senderId) continue
                this.announce(existingId, join.senderId)
            }

            // 2) Tell all existing peers about the new client
            // for (const [existingId, _existingConn] of this.peers) {
            for (const existingId of Object.keys(this.sockets)) {
                if (existingId === join.senderId) continue
                this.announce(join.senderId, existingId)
            }

            // 3) If this is a storage server,
            //    then announce ourselves as a peer
            if (this.isStorageServer) {
                assert(this.peerId)
                this.announce(this.peerId, join.senderId)
            }

            return
        }

        // --- Post-handshake: relay all messages as raw binary ---
        const msg = message as BaseMsg
        const t = msg.targetId as string|undefined
        const isAliasToServer = typeof t === 'string' && t.startsWith('server:')
        const deliverToLocal = t === this.peerId || isAliasToServer

        // 1) Let the repo process frames addressed to THIS adapter
        if (deliverToLocal) {
            const localMsg = isAliasToServer ?
                { ...msg, targetId: this.peerId } :
                msg
            this.emit('message', localMsg)
        }

        // 2) Relay to an explicit target if present
        if (t) {
            const target = this.sockets[t]
            if (target) {
                target.send(raw)
                return
            }
        }

        // 3) Optional fan-out for "server:*" convention
        if (isAliasToServer) {
            for (const [peerId, conn] of Object.entries(this.sockets)) {
                if (peerId === msg.senderId) continue
                conn.send(toArrayBuffer(cborEncode({
                    ...msg,
                    targetId: peerId
                })))
            }
        }
    }

    private announce (announcedPeerId:string, toClientId:string) {
        const msg:PeerMessage = {
            type: 'peer',
            senderId: announcedPeerId,  // the peer being announced
            targetId: toClientId,  // the client who should learn about it
            selectedProtocolVersion: SUPPORTED_PROTOCOL_VERSION,
            peerMetadata: {},
        }

        const toConn = this.sockets[toClientId]
        if (toConn) {
            toConn.send(toArrayBuffer(cborEncode(msg)))
        }
    }

    // HTTP endpoint for health check
    async onRequest (req:Party.Request) {
        if (new URL(req.url).pathname.includes('/health')) {
            return Response.json({
                status: 'ok',
                room: this.room.id,
                connectedPeers: Array.from(this.room.getConnections()).length
            }, { status: 200, headers: CORS })
        }

        return new Response('👍 All good', { status: 200, headers: CORS })
    }

    // ---- helpers ----
    protected sendErrorAndClose (conn:Party.Connection, message:string):void {
        const errorMsg = { type: 'error', message }
        try {
            conn.send(toArrayBuffer(cborEncode(errorMsg)))
        } finally {
            conn.close()
        }
    }
}

// Usage notes:
// * Clients connect with Repo configured for WebSocket network adapter
//    pointing to your Party URL:
//    ws(s)://<your-domain>/parties/<projectName>/<roomId>
// * Each room gives you isolation: peers in the same room can address each
//    other by `peerId`.
// * This server does NOT persist or synthesize Automerge sync messages—it only
//    forwards CBOR frames.

const selectProtocol = (versions?:ProtocolVersion[]) => {
    if (versions === undefined) return ProtocolV1
    if (versions.includes(ProtocolV1)) return ProtocolV1
    return null
}

// function joinMessage (
//     senderId: PeerId,
//     peerMetadata: PeerMetadata
// ):JoinMsg {
//     return {
//         type: 'join',
//         senderId,
//         peerMetadata,
//         supportedProtocolVersions: [ProtocolV1],
//     }
// }
