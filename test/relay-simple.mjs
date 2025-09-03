import { spawn } from 'child_process'
import { createRequire } from 'module'

// Use require to import CommonJS modules in ESM context
const require = createRequire(import.meta.url)

let serverProcess = null

// Cleanup function
async function cleanup () {
    if (serverProcess && !serverProcess.killed) {
        console.log('Cleaning up server process...')
        serverProcess.kill('SIGTERM')
        await new Promise(resolve => setTimeout(resolve, 2000))
        if (!serverProcess.killed) {
            console.log('Force killing server process...')
            serverProcess.kill('SIGKILL')
        }
        serverProcess = null
    }
}

// Handle process signals to ensure cleanup
process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, cleaning up...')
    await cleanup()
    process.exit(0)
})

process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, cleaning up...')
    await cleanup()
    process.exit(0)
})

process.on('exit', () => {
    if (serverProcess && !serverProcess.killed) {
        console.log('Process exiting, killing server...')
        serverProcess.kill('SIGKILL')
    }
})

async function runRelayTests () {
    console.log('Starting PartyKit relay server for testing...')

    serverProcess = spawn('npx', [
        'partykit', 'dev',
        '--config', 'example_backend/partykit-relay.json',
        '--port', '1999'
    ], {
        stdio: ['ignore', 'pipe', 'pipe']
    })    // Wait for server to be ready
    const readyPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Server startup timeout'))
        }, 30000)

        const checkOutput = (data) => {
            const output = data.toString()
            console.log('[Server]', output.trim())
            if (output.includes('Ready on http') || output.includes('Relay-only server started')) {
                clearTimeout(timeout)
                resolve()
            }
        }

        serverProcess.stdout.on('data', checkOutput)
        serverProcess.stderr.on('data', checkOutput)

        serverProcess.on('error', (err) => {
            clearTimeout(timeout)
            reject(err)
        })
    })

    try {
        await readyPromise
        console.log('Server ready, waiting 2 seconds for stability...')
        await new Promise(resolve => setTimeout(resolve, 2000))

        console.log('\nRunning relay server tests...')

        // Test 1: Basic HTTP endpoints
        await testBasicEndpoints()

        // Test 2: Document synchronization between two repo instances
        await testDocumentRelay()

        console.log('\nAll relay server tests completed successfully!')
    } catch (error) {
        console.error('Test failed:', error)
        process.exit(1)
    } finally {
        await cleanup()
    }
}

async function testBasicEndpoints () {
    console.log('Testing HTTP endpoints...')

    // Test health check
    try {
        const response = await fetch('http://localhost:1999/parties/main/health')
        const status = response.status === 200 ? 'PASS' : 'FAIL'
        console.log('Health check endpoint:', status)
    } catch (error) {
        console.log('Health check failed:', error.message)
        throw error
    }

    // Test room health check
    try {
        const response = await fetch('http://localhost:1999/parties/main/test-room/health')
        const data = await response.json()
        console.log('Room health check: PASS')
        console.log('  Connected peers:', data.connectedPeers)
    } catch (error) {
        console.log('Room health check failed:', error.message)
        throw error
    }
}

async function testDocumentRelay () {
    console.log('Testing document relay between repo instances...')

    try {
        // Import the required modules
        const { Repo } = require('@substrate-system/automerge-repo-slim')
        const {
            PartykitNetworkAdapter
        } = require('../dist/client/partykit-websocket-adapter.cjs')

        const roomId = `relay-test-${Date.now()}`
        const HOST = 'http://localhost:1999'

        console.log(`  Using room: ${roomId}`)

        // Create first repo instance
        const repo1 = new Repo({
            network: [new PartykitNetworkAdapter({
                host: HOST,
                room: roomId
            })]
        })

        // Create a document in repo1
        console.log('  Creating document in repo1...')
        const handle1 = repo1.create()
        handle1.change((doc) => {
            doc.text = 'Hello from repo1'
            doc.counter = 42
            doc.timestamp = Date.now()
        })

        const documentId = handle1.documentId
        console.log(`  Document ID: ${documentId}`)

        // Wait for network to be ready and document to sync
        await new Promise(resolve => setTimeout(resolve, 3000))

        // Create second repo instance
        console.log('  Creating second repo instance...')
        const repo2 = new Repo({
            network: [new PartykitNetworkAdapter({
                host: HOST,
                room: roomId
            })]
        })

        // Request the same document from repo2
        console.log('  Requesting document from repo2...')
        const handle2 = await repo2.find(documentId)

        // Wait for synchronization
        console.log('  Waiting for synchronization...')
        await new Promise(resolve => setTimeout(resolve, 5000))

        // Check if document synced properly
        await handle2.whenReady()
        const doc2 = handle2.doc()

        if (doc2) {
            console.log('  Document synchronized successfully!')
            console.log(`  Content: "${doc2.text}"`)
            console.log(`  Counter: ${doc2.counter}`)

            // Verify content matches
            if (doc2.text === 'Hello from repo1' && doc2.counter === 42) {
                console.log('  Document content verification: PASS')
            } else {
                throw new Error('Document content mismatch')
            }

            // Test bidirectional sync - modify from repo2
            console.log('  Testing bidirectional sync...')
            handle2.change((doc) => {
                doc.text = 'Modified from repo2'
                doc.counter = 99
            })

            // Wait for sync back to repo1
            await new Promise(resolve => setTimeout(resolve, 3000))

            const doc1Updated = handle1.doc()
            if (doc1Updated && doc1Updated.text === 'Modified from repo2' && doc1Updated.counter === 99) {
                console.log('  Bidirectional sync: PASS')
            } else {
                throw new Error('Bidirectional sync failed')
            }
        } else {
            throw new Error('Document not found in repo2')
        }

        // Clean up connections
        repo1.networkSubsystem.adapters.forEach(adapter => adapter.disconnect())
        repo2.networkSubsystem.adapters.forEach(adapter => adapter.disconnect())

        // Force cleanup of any remaining network connections
        await new Promise(resolve => setTimeout(resolve, 1000))

        console.log('  Cleaned up connections')
    } catch (error) {
        console.error('Document relay test failed:', error.message)
        throw error
    }
}

runRelayTests()
    .then(() => {
        console.log('Tests completed successfully')
        process.exit(0)
    })
    .catch((error) => {
        console.error('Tests failed:', error)
        process.exit(1)
    })
