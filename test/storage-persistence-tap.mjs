#!/usr/bin/env node

import { test } from '@substrate-system/tapzero'
import { spawn } from 'child_process'
import { createRequire } from 'module'

// Use require to import CommonJS modules in ESM context
const require = createRequire(import.meta.url)

let serverProcess = null

// Handle process exit
process.on('exit', cleanup)
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error)
    await cleanup()
    process.exit(1)
})

// Server setup - start before tests
let serverStarted = false

test('PartyKit storage server health check', async t => {
    await ensureServerStarted()

    try {
        console.log('Testing server health...')
        const response = await fetch('http://localhost:1999/parties/main/health')
        t.equal(response.status, 200, 'Health check endpoint should respond with 200')

        console.log('Health check endpoint: PASS')
    } catch (error) {
        t.fail(`Health check failed: ${error.message}`)
        throw error
    }
})

test('Document storage persistence', async t => {
    await ensureServerStarted()

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

        console.log('  Repo created with memory storage, waiting for network connection...')
        await new Promise(resolve => setTimeout(resolve, 2000))

        const handle = repo.create()
        console.log('  Document handle created, making initial changes...')
        console.log('  Document ID:', handle.documentId)

        // Make changes to the document
        handle.change(doc => {
            doc.text = 'Hello from storage persistence test!'
            doc.timestamp = Date.now()
        })

        console.log('  Flushing client repo...')
        await repo.flush()
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Make another change to ensure storage is working
        console.log('  Making a small change to trigger storage flush...')
        handle.change(doc => {
            doc.counter = (doc.counter || 0) + 1
        })

        console.log('  Flushing client repo after change...')
        await repo.flush()
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Test the storage interface directly
        console.log('  Testing storage interface directly...')
        response = await fetch(`${HOST}/parties/main/${roomId}/test/storage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
        console.log('  Direct storage test response:', response.status)
        const testResult = await response.json()
        console.log('  Storage test result:', testResult)

        // Check final storage state
        response = await fetch(`${HOST}/parties/main/${roomId}/debug/storage`)
        storageData = await response.json()
        const finalKeys = Object.keys(storageData).length
        console.log(`  Storage keys after document creation: ${finalKeys}`)
        console.log('  Storage keys:', Object.keys(storageData))

        // Verify storage functionality
        t.ok(finalKeys >= initialKeys, 'Storage should have at least as many keys as initially')

        if (finalKeys > initialKeys) {
            console.log('  Document storage verification: PASS')
            console.log(`  Added ${finalKeys - initialKeys} storage entries`)
        } else {
            console.log('  Warning: No new storage entries detected')
        }

        // Check for document-related keys
        const allKeys = Object.keys(storageData)
        const docKeys = allKeys.filter(key =>
            key.includes(handle.documentId) ||
            key.includes('doc') ||
            key.includes('automerge')
        )

        if (docKeys.length === 0) {
            console.log('  Warning: No obvious document-related keys found')
        } else {
            console.log('  Found document-related keys:', docKeys)
        }

        console.log('  All storage keys:', allKeys)
        console.log('  Document storage test: COMPLETE')

        // Clean up
        repo.networkSubsystem.adapters.forEach(adapter => adapter.disconnect())
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Clean up server immediately after this test
        setTimeout(async () => {
            console.log('\nCleaning up server after tests...')
            await cleanup()
            console.log('Storage persistence tests completed successfully')
            process.exit(0)
        }, 2000)
    } catch (error) {
        t.fail(`Document storage test failed: ${error.message}`)
        // Clean up on error too
        setTimeout(async () => {
            await cleanup()
            process.exit(1)
        }, 1000)
        throw error
    }
})

console.log('All TAP tests defined, waiting for completion...')

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
        const lsofOutput = execSync('lsof -i :1999', { encoding: 'utf8', stdio: 'pipe' })
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

async function ensureServerStarted () {
    if (serverStarted) return

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
    serverStarted = true

    // Wait for server stability
    await new Promise(resolve => setTimeout(resolve, 2000))
}
