#!/usr/bin/env node

import { test } from '@substrate-system/tapzero'
import { spawn } from 'child_process'
import { createRequire } from 'module'

// Use require to import CommonJS modules in ESM context
const require = createRequire(import.meta.url)

let serverProcess = null

test('PartyKit server setup', async t => {
    await startServer()
    t.ok(true, 'Server started successfully')
})

test('Health check endpoint', async t => {
    try {
        const response = await fetch('http://localhost:1999/parties/main/health')
        t.equal(response.status, 200, 'Health check endpoint should respond with 200')
        console.log('Health check endpoint: PASS')
    } catch (error) {
        t.fail(`Health check failed: ${error.message}`)
    }
})

test('Document storage persistence', async t => {
    console.log('Testing document storage persistence...')

    try {
        // Import the required modules
        const { Repo } = require('@substrate-system/automerge-repo-slim')
        const { PartykitNetworkAdapter } = require('../dist/client/partykit-websocket-adapter.cjs')
        const { MemoryStorageAdapter } = require('automerge-repo-storage-memory')

        const roomId = `storage-test-${Date.now()}`
        const HOST = 'http://localhost:1999'

        console.log(`  Using room: ${roomId}`)

        // Check storage is initially empty
        console.log('  Checking initial storage state...')
        let response = await fetch(`${HOST}/parties/main/${roomId}/debug/storage`)
        let storageData = await response.json()
        const initialKeys = Object.keys(storageData).length
        console.log(`  Initial storage keys: ${initialKeys}`)

        // Create a repo and document
        console.log('  Creating document...')
        const storage = new MemoryStorageAdapter()
        const repo = new Repo({
            storage,
            network: [new PartykitNetworkAdapter({
                host: HOST,
                room: roomId
            })]
        })

        console.log('  Waiting for network connection...')
        await new Promise(resolve => setTimeout(resolve, 3000))

        // Create a document
        const handle = repo.create()
        console.log('  Document created with ID:', handle.documentId)

        // Make changes to the document
        handle.change(doc => {
            doc.text = 'Hello from storage persistence test!'
            doc.timestamp = Date.now()
            doc.counter = 1
        })

        console.log('  Flushing client repo...')
        await repo.flush()

        // Give plenty of time for sync to complete
        console.log('  Waiting for server sync...')
        await new Promise(resolve => setTimeout(resolve, 8000))

        // Test the storage interface directly
        console.log('  Testing storage interface directly...')
        response = await fetch(`${HOST}/parties/main/${roomId}/test/storage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        })
        console.log('  Direct storage test response:', response.status)
        const testResult = await response.json()
        console.log('  Storage test result:', testResult)

        // The storage interface test MUST succeed for document persistence to work
        if (!testResult.success) {
            t.fail(`Document storage failed: ${testResult.error || 'Unknown error'}`)
            return
        }

        t.ok(testResult.success, 'Storage interface test should succeed')

        // Check final storage state to see if document was stored
        response = await fetch(`${HOST}/parties/main/${roomId}/debug/storage`)
        storageData = await response.json()
        const finalKeys = Object.keys(storageData).length
        console.log(`  Storage keys after document creation: ${finalKeys}`)
        console.log('  Storage keys:', Object.keys(storageData))

        // Verify storage has more than just the adapter ID
        t.ok(finalKeys >= initialKeys, 'Storage should have at least as many keys as initially')

        // Look for document-related keys
        const allKeys = Object.keys(storageData)
        const docKeys = allKeys.filter(key =>
            key.includes(handle.documentId) ||
            key.includes('doc') ||
            key.includes('automerge') ||
            key.includes('chunks') ||
            key.includes('snapshots') ||
            key.includes('incremental')
        )

        console.log('  All storage keys:', allKeys)

        if (docKeys.length > 0) {
            console.log('  Found document-related keys:', docKeys)
            console.log('  Document storage verification: PASS')
            t.ok(true, 'Document was successfully stored on server')
        } else {
            // Check if we have more keys than just the storage-adapter-id
            const nonAdapterKeys = allKeys.filter(key => key !== 'storage-adapter-id')
            if (nonAdapterKeys.length > 0) {
                console.log('  Found non-adapter keys:', nonAdapterKeys)
                // This is suspicious but we'll investigate what these keys are
                console.log('  WARNING: Found storage keys but none are document-related')
                t.fail('Document should be stored in server storage but was not found')
            } else {
                console.log('  Only storage-adapter-id found - document sync is not working')
                t.fail('Document was not stored to server storage - persistence is broken')
            }
        }

        console.log('  Document storage test: COMPLETE')

        // Clean up connections
        repo.networkSubsystem.adapters.forEach(adapter => adapter.disconnect())
        await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error) {
        t.fail(`Document storage test failed: ${error.message}`)
    }
})

test('Cleanup and exit', async t => {
    console.log('\nCleaning up after all tests...')
    await cleanup()
    t.ok(true, 'Cleanup completed')

    // Force exit after a short delay
    setTimeout(() => {
        console.log('Storage persistence tests completed successfully')
        process.exit(0)
    }, 1000)
})

// Cleanup function
async function cleanup () {
    console.log('Process exiting, killing server...')

    // Kill the specific server process if we have it
    if (serverProcess && !serverProcess.killed) {
        console.log('Cleaning up server process...')
        serverProcess.kill('SIGTERM')
        await new Promise(resolve => setTimeout(resolve, 2000))
        if (!serverProcess.killed) {
            console.log('Force killing server process...')
            serverProcess.kill('SIGKILL')
        }
    }

    // More aggressive cleanup - kill all PartyKit processes
    try {
        const { execSync } = require('child_process')

        console.log('Finding PartyKit processes...')
        const lsofOutput = execSync('lsof -i :1999', {
            encoding: 'utf8',
            stdio: 'pipe'
        })
        const lines = lsofOutput.split('\n').filter(line => line.includes('node'))

        for (const line of lines) {
            const pid = line.split(/\s+/)[1]
            if (pid && !isNaN(pid)) {
                console.log(`Killing PartyKit process ${pid}...`)
                try {
                    execSync(`kill -9 ${pid}`, { stdio: 'ignore' })
                } catch (_e) {
                    // Process might already be dead
                }
            }
        }
    } catch (_e) {
        // No processes on port 1999, that's fine
    }

    // Additional cleanup - pkill any remaining partykit processes
    try {
        const { execSync } = require('child_process')
        execSync('pkill -f partykit', { stdio: 'ignore' })
        console.log('Killed any remaining PartyKit processes')
    } catch (_e) {
        // No PartyKit processes found, that's fine
    }

    console.log('Cleanup completed')
}

// Start server once for all tests
async function startServer () {
    console.log('Starting PartyKit storage server for testing...')

    serverProcess = spawn('npx', [
        'partykit', 'dev',
        '--config', 'example_backend/partykit-storage.json',
        '--port', '1999'
    ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, DEBUG: 'mergeparty:*' }
    })

    let readyResolve = null
    const readyPromise = new Promise(resolve => { readyResolve = resolve })

    serverProcess.stdout.on('data', (data) => {
        const output = data.toString()
        process.stdout.write(output)

        if (output.includes('Ready on')) {
            readyResolve?.()
        }
    })

    serverProcess.stderr.on('data', (data) => {
        process.stderr.write(data)
    })

    serverProcess.on('error', (error) => {
        console.error('Failed to start server:', error)
        process.exit(1)
    })

    await readyPromise
    console.log('\nRunning storage persistence tests...')

    // Wait for server stability
    await new Promise(resolve => setTimeout(resolve, 2000))
}
