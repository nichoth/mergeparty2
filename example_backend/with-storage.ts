import type * as Party from 'partykit/server'
import Debug from '@substrate-system/debug'
import { WithStorage } from '../src/server/with-storage.js'

/**
 * Websocket server with storage.
 * This example shows how to extend the WithStorage class.
 *
 * Health check:
 * http://localhost:1999/parties/main/<doc-id>
 *
 * See a list of documents we have in the repo:
 * http://localhost:1999/parties/main/<doc-id>/debug/storage
 */

/**
 * The base class, `WithStorage`, sets the `_repo` property when we construct
 * a new one.
 */
export default class StorageExample extends WithStorage implements Party.Server {
    constructor (room) {
        super(room)
        this._log = Debug('app:storage')
    }

    async onRequest (req:Party.Request) {
        const url = new URL(req.url)

        // Handle HEAD requests for health checking (used by wait-on)
        if (req.method === 'HEAD') {
            return new Response(null, { status: 200 })
        }

        if (url.pathname.includes('/debug/storage')) {
            const all = await this.room.storage.list()
            return Response.json(Object.fromEntries(all))
        }

        // Add a test endpoint to manually trigger storage operations
        if (url.pathname.includes('/test/storage') && req.method === 'POST') {
            try {
                const body = await req.json()
                // Save a test value to storage
                await this.room.storage.put('test-manual-storage', JSON.stringify(body))

                // Try to flush the repo
                await this._repo.flush()

                return Response.json({
                    success: true,
                    message: 'Storage test completed',
                    storageCount: (await this.room.storage.list()).size
                })
            } catch (error) {
                return Response.json({
                    success: false,
                    error: error.message
                }, { status: 500 })
            }
        }

        return super.onRequest(req)
    }

    // You can also override other methods or add new ones
    async onConnect (conn:Party.Connection) {
        // Call parent onConnect
        super.onConnect(conn)
    }
}
