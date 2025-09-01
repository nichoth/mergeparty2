import type * as Party from 'partykit/server'
import { CORS } from '../src/server/index.js'
import { Relay } from '../src/server/relay.js'
import { type PeerId, Repo } from '@substrate-system/automerge-repo-slim'

/**
 * Network-only server (no storage)
 * This example shows how to use just the network adapter for pure relay functionality
 * http://localhost:1999/parties/network-only/example
 */

export default class NetworkOnlyServer extends Relay {
    constructor (room) {
        super(room)
        /**
         * Set _repo so that the network adapter adds itself
         */
        this._repo = new Repo({
            peerId: 'server:' + this.room.id as PeerId
        })
    }

    static async onBeforeConnect (request:Party.Request, _lobby:Party.Lobby) {
        try {
            // auth here

            return request
        } catch (_err) {
            const err = _err as Error
            return new Response(
                'Unauthorized -- ' + err.message,
                { status: 401, headers: CORS }
            )
        }
    }

    async onStart ():Promise<void> {
        console.log('**Relay-only server started**')
    }
}

NetworkOnlyServer satisfies Party.Worker
