import type * as Party from 'partykit/server'
import { CORS } from '../src/server/index.js'
import { Relay } from '../src/server/relay.js'

/**
 * Network-only server (no storage)
 * Use just the network adapter as a pure relay server.
 * http://localhost:1999/parties/main/<doc-id>
 */

export default class NetworkOnlyServer extends Relay {
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
