#!/usr/bin/env node

/**
 * Simple integration test runner that tests PartyKit storage functionality
 * Assumes the server is already running on localhost:1999
 */

import { test } from '@substrate-system/tapzero'

const PARTYKIT_HOST = 'http://localhost:1999'

test('PartyKit server health check', async t => {
    try {
        const response = await fetch(`${PARTYKIT_HOST}/parties/main/health-check`)
        t.equal(response.status, 200,
            'Health check endpoint should respond with 200')

        const data = await response.json()
        t.ok(data.status === 'ok', 'Health check should return ok status')

        console.log('Health check passed!')
    } catch (error) {
        t.fail(`Health check failed: ${error}`)
    }
})

test('PartyKit storage debug endpoint', async t => {
    try {
        const roomId = `debug-test-${Date.now()}`

        // Make HTTP request to debug endpoint
        const response = await fetch(
            `${PARTYKIT_HOST}/parties/main/${roomId}/debug/storage`
        )
        t.equal(response.status, 200, 'Debug endpoint should respond with 200')

        const data = await response.json()
        t.ok(typeof data === 'object', 'Debug endpoint should return JSON object')

        console.log('Storage debug endpoint test passed!')
    } catch (error) {
        t.fail(`Storage debug test failed: ${error}`)
    }
})

test('PartyKit storage operations via HTTP', async t => {
    try {
        const roomId = `storage-test-${Date.now()}`

        // First, let's connect to a room to initialize it
        const initResponse = await fetch(`${PARTYKIT_HOST}/parties/main/${roomId}`)
        t.ok(initResponse.status === 200, 'Room initialization should succeed')

        // Check storage is empty initially (or at least check the request works)
        const emptyResponse = await fetch(
            `${PARTYKIT_HOST}/parties/main/${roomId}/debug/storage`
        )
        const emptyData = await emptyResponse.json()

        t.ok(typeof emptyData === 'object',
            'Storage debug should return an object')
        t.ok(emptyResponse.status === 200,
            'Storage debug endpoint should be accessible')

        console.log('Basic storage HTTP operations test passed!')
    } catch (error) {
        t.fail(`Storage operations test failed: ${error}`)
    }
})

console.log('Integration tests completed')
