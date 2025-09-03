import { test } from '@substrate-system/tapzero'
import { WithStorage } from '../src/server/with-storage.js'

// Mock PartyKit Room and storage
class MockStorage {
    private data = new Map<string, ArrayBuffer>()

    async get (key: string): Promise<ArrayBuffer | undefined> {
        return this.data.get(key)
    }

    async put (key: string, value: ArrayBuffer): Promise<void> {
        this.data.set(key, value)
    }

    async delete (key: string): Promise<void> {
        this.data.delete(key)
    }

    async list (options?: { prefix?: string }): Promise<Map<string, ArrayBuffer>> {
        if (!options?.prefix) {
            return new Map(this.data)
        }

        const filtered = new Map<string, ArrayBuffer>()
        for (const [key, value] of this.data) {
            if (key.startsWith(options.prefix)) {
                filtered.set(key, value)
            }
        }
        return filtered
    }
}

class MockRoom {
    public id = 'test-room'
    public storage = new MockStorage()
    public env: any = {}

    getConnections () {
        return []
    }
}

test('WithStorage - save and load data', async t => {
    const mockRoom = new MockRoom() as any
    const storage = new WithStorage(mockRoom)

    // Test basic save/load
    const key = ['doc', 'test-id', 'chunks']
    const testData = new Uint8Array([1, 2, 3, 4, 5])

    await storage.save(key, testData)
    const loaded = await storage.load(key)

    t.ok(loaded, 'Should load saved data')
    t.deepEqual(Array.from(loaded!), Array.from(testData), 'Loaded data should match saved data')
})

test('WithStorage - load non-existent key', async t => {
    const mockRoom = new MockRoom() as any
    const storage = new WithStorage(mockRoom)

    const result = await storage.load(['non', 'existent', 'key'])
    t.equal(result, undefined, 'Should return undefined for non-existent key')
})

test('WithStorage - remove data', async t => {
    const mockRoom = new MockRoom() as any
    const storage = new WithStorage(mockRoom)

    const key = ['doc', 'test-id', 'remove-test']
    const testData = new Uint8Array([1, 2, 3])

    await storage.save(key, testData)
    let loaded = await storage.load(key)
    t.ok(loaded, 'Should load saved data before removal')

    await storage.remove(key)
    loaded = await storage.load(key)
    t.equal(loaded, undefined, 'Should return undefined after removal')
})

test('WithStorage - loadRange with prefix', async t => {
    const mockRoom = new MockRoom() as any
    const storage = new WithStorage(mockRoom)

    // Save multiple items with the same prefix
    const prefix = ['doc', 'test-id']
    await storage.save([...prefix, 'chunk1'], new Uint8Array([1, 2]))
    await storage.save([...prefix, 'chunk2'], new Uint8Array([3, 4]))
    await storage.save([...prefix, 'chunk3'], new Uint8Array([5, 6]))
    await storage.save(['other', 'doc'], new Uint8Array([7, 8])) // different prefix

    const results = await storage.loadRange(prefix)

    t.equal(results.length, 3, 'Should load 3 items with matching prefix')
    t.ok(results.every(r => r.key.slice(0, 2).join('.') === prefix.join('.')), 'All results should have matching prefix')
})

test('WithStorage - removeRange with prefix', async t => {
    const mockRoom = new MockRoom() as any
    const storage = new WithStorage(mockRoom)

    const prefix = ['doc', 'remove-test']
    await storage.save([...prefix, 'chunk1'], new Uint8Array([1, 2]))
    await storage.save([...prefix, 'chunk2'], new Uint8Array([3, 4]))
    await storage.save(['other', 'doc'], new Uint8Array([7, 8])) // different prefix

    await storage.removeRange(prefix)

    const results = await storage.loadRange(prefix)
    t.equal(results.length, 0, 'Should have no items after removeRange')

    // Verify other data is still there
    const otherData = await storage.load(['other', 'doc'])
    t.ok(otherData, 'Data with different prefix should still exist')
})
