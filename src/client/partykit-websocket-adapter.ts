import {
    WebSocketClientAdapter
} from '@automerge/automerge-repo-network-websocket'
import { createDebug } from '@substrate-system/debug'
const debug = createDebug('mergeparty:network')

interface PartyKitNetworkAdapterOptions {
    host?:string
    room:string
    party?:string
}

/**
 * A WebSocket network adapter that connects to PartyKit servers.
 * This is just a thin wrapper around the official `WebSocketClientAdapter`.
 * This constructs the correct PartyKit webSocket URL.
 */
export class PartykitNetworkAdapter extends WebSocketClientAdapter {
    constructor (options:PartyKitNetworkAdapterOptions) {
        // Construct the PartyKit WebSocket URL
        // PartyKit WebSocket URL format: ws://host/parties/<party>/<room>
        const host = options.host || 'localhost:1999'
        const protocol = host.startsWith('http://') ? 'ws://' : 'wss://'
        const party = options.party || 'main'
        const cleanHost = host.replace(/^https?:\/\//, '')
        const room = options.room
        const url = `${protocol}${cleanHost}/parties/${party}/${room}`

        // Call the parent constructor with the constructed URL
        super(url)

        debug('Connecting to PartyKit server:', url)
    }
}
