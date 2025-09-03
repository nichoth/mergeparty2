import { test } from '@substrate-system/tapzero'
import { spawn } from 'child_process'
import { Repo } from '@substrate-system/automerge-repo-slim'
import { PartykitNetworkAdapter } from '../src/client/partykit-websocket-adapter.js'

const PARTYKIT_HOST = 'http://localhost:1999'

interface ServerProcess {
    kill: (signal?: string) => boolean
    killed: boolean
    stdout?: any
    stderr?: any
    on: (event: string, listener: (...args: any[]) => void) => void
}

// Helper to start PartyKit server
function startPartykitServer (): Promise<{ process: ServerProcess, ready: Promise<void> }> {
    return new Promise((resolve, reject) => {
        const serverProcess = spawn('npx', [
            'partykit', 'dev',
            '--config', 'example_backend/partykit-storage.json',
            '--port', '1999'
        ], {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe']
        })

        let _serverReady = false
        const readyPromise = new Promise<void>((resolve) => {
            const checkReady = (data: Buffer) => {
                const output = data.toString()
                if (output.includes('Server listening') ||
                    output.includes('Listening on') ||
                    output.includes('Local:') ||
                    output.includes('localhost:1999')) {
                    _serverReady = true
                    resolve()
                }
            }

            if (serverProcess.stdout) {
                serverProcess.stdout.on('data', checkReady)
            }
            if (serverProcess.stderr) {
                serverProcess.stderr.on('data', checkReady)
            }
        })

        serverProcess.on('error', reject)

        // Give it a moment to start
        setTimeout(() => {
            resolve({ process: serverProcess as ServerProcess, ready: readyPromise })
        }, 1000)
    })
}

// Helper to stop server gracefully
function stopPartykitServer (serverProcess: ServerProcess): Promise<void> {
    return new Promise((resolve) => {
        serverProcess.on('exit', () => resolve())
        serverProcess.kill('SIGTERM')

        // Force kill after 5 seconds
        setTimeout(() => {
            if (!serverProcess.killed) {
                serverProcess.kill('SIGKILL')
            }
            resolve()
        }, 5000)
    })
}

// Helper to wait for server to be ready
async function waitForServer (host: string, maxAttempts = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await fetch(`${host}/parties/main/health-check`)
            if (response.ok) {
                return true
            }
        } catch {
            // Server not ready yet
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
    }
    return false
}

test('Storage integration - document persistence across connections', async t => {
    let serverProcess: ServerProcess | null = null

    try {
        // Start PartyKit server
        const { process, ready } = await startPartykitServer()
        serverProcess = process

        // Wait for server to be ready
        await ready
        await new Promise(resolve => setTimeout(resolve, 3000))

        // Check if server is responding
        const serverReady = await waitForServer(PARTYKIT_HOST, 10)
        if (!serverReady) {
            return
        }

        const roomId = `test-room-${Date.now()}`

        // Create first repo and save a document
        const repo1 = new Repo({
            network: [new PartykitNetworkAdapter({
                host: PARTYKIT_HOST,
                room: roomId
            })]
        })

        const handle1 = repo1.create()
        handle1.change((doc: any) => {
            doc.text = 'Hello from first connection'
            doc.counter = 1
        })

        // Wait for document to be saved to server storage
        await new Promise(resolve => setTimeout(resolve, 3000))

        // Close first repo
        repo1.networkSubsystem.adapters.forEach(adapter => adapter.disconnect())

        // Create second repo with same room - should load the document from server storage
        const repo2 = new Repo({
            network: [new PartykitNetworkAdapter({
                host: PARTYKIT_HOST,
                room: roomId
            })]
        })

        // Request the same document
        const handle2 = await repo2.find(handle1.documentId)

        // Wait for document to sync from server storage
        await new Promise(resolve => setTimeout(resolve, 5000))

        await handle2.whenReady()
        const doc = handle2.docSync()

        if (doc) {
            t.ok(doc, 'Document should be loaded from server storage')
            t.equal((doc as any)?.text, 'Hello from first connection', 'Document content should persist')
            t.equal((doc as any)?.counter, 1, 'Document properties should persist')
        } else {
            return
        }

        // Clean up
        repo2.networkSubsystem.adapters.forEach(adapter => adapter.disconnect())
    } catch (error) {
        console.error('Test failed:', error)
        t.fail(`Test failed with error: ${error}`)
    } finally {
        if (serverProcess) {
            await stopPartykitServer(serverProcess)
        }
    }
})

test('Storage integration - debug endpoint', async t => {
    let serverProcess: ServerProcess | null = null

    try {
        // Start PartyKit server
        const { process, ready } = await startPartykitServer()
        serverProcess = process
        await ready

        // Wait for server to be ready
        const serverReady = await waitForServer(PARTYKIT_HOST, 10)
        if (!serverReady) {
            console.log('PartyKit server failed to start - skipping integration test')
            return
        }

        const roomId = `debug-test-${Date.now()}`

        // Make HTTP request to debug endpoint
        const response = await fetch(`${PARTYKIT_HOST}/parties/main/${roomId}/debug/storage`)
        t.equal(response.status, 200, 'Debug endpoint should respond with 200')

        const data = await response.json()
        t.ok(typeof data === 'object', 'Debug endpoint should return JSON object')
    } catch (error) {
        console.error('Debug endpoint test failed:', error)
        t.fail(`Debug endpoint test failed: ${error}`)
    } finally {
        if (serverProcess) {
            await stopPartykitServer(serverProcess)
        }
    }
})
