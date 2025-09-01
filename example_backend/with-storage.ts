import type * as Party from 'partykit/server'
import { WithStorage } from '../src/server/with-storage.js'

/**
 * Websocket server with storage
 * This example shows how to extend the WithStorage class
 * http://localhost:1999/parties/main/<doc-id>
 */

/**
 * The base class, `WithStorage`, sets the `_repo` property when we construct
 * a new one.
 */
export default class StorageExample extends WithStorage implements Party.Server {
    // constructor (room) {
    //     super(room)
    // }

    async onRequest (req:Party.Request) {
        const url = new URL(req.url)

        if (url.pathname.includes('/debug/storage')) {
            const all = await this.room.storage.list()
            return Response.json(Object.fromEntries(all))
        }

        return super.onRequest(req)
    }

    // You can also override other methods or add new ones
    async onConnect (conn:Party.Connection) {
        // Call parent onConnect
        super.onConnect(conn)
    }
}
