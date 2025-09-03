import { test } from '@substrate-system/tapzero'

/**
 * Simplified storage tests that don't require Node.js modules or full repo
 * These tests focus on the storage interface logic in a browser-compatible way
 */

// Simple mock of PartyKit storage for browser environment
class BrowserMockStorage {
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

// Simple storage interface implementation (mimics WithStorage key logic)
class SimpleStorageInterface {
    private storage: BrowserMockStorage

    constructor (storage: BrowserMockStorage) {
        this.storage = storage
    }

    async save (key: string[], value: Uint8Array): Promise<void> {
        const keyString = key.join('.')
        const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
        await this.storage.put(keyString, buffer)
    }

    async load (key: string[]): Promise<Uint8Array | undefined> {
        const keyString = key.join('.')
        const buffer = await this.storage.get(keyString)
        if (!buffer) return undefined
        return new Uint8Array(buffer)
    }

    async remove (key: string[]): Promise<void> {
        const keyString = key.join('.')
        await this.storage.delete(keyString)
    }

    async loadRange (prefix: string[]): Promise<Array<{
        key: string[],
        data: Uint8Array
    }>> {
        const prefixString = prefix.join('.')
        const map = await this.storage.list({ prefix: prefixString })
        const results: Array<{ key: string[], data: Uint8Array }> = []

        for (const [keyString, buffer] of map) {
            results.push({
                key: keyString.split('.'),
                data: new Uint8Array(buffer)
            })
        }

        return results.sort((a, b) => a.key.join('.').localeCompare(b.key.join('.')))
    }

    async removeRange (prefix: string[]): Promise<void> {
        const prefixString = prefix.join('.')
        const map = await this.storage.list({ prefix: prefixString })

        for (const key of map.keys()) {
            await this.storage.delete(key)
        }
    }
}

test('Simple storage interface - save and load', async t => {
    const mockStorage = new BrowserMockStorage()
    const storage = new SimpleStorageInterface(mockStorage)

    const key = ['docs', 'test-doc', 'chunk-1']
    const data = new TextEncoder().encode('Hello, storage!')

    await storage.save(key, data)
    const loaded = await storage.load(key)

    t.ok(loaded, 'Should load saved data')
    const loadedText = new TextDecoder().decode(loaded!)
    t.equal(loadedText, 'Hello, storage!', 'Loaded data should match saved data')
})

test('Simple storage interface - key serialization', async t => {
    const mockStorage = new BrowserMockStorage()
    const storage = new SimpleStorageInterface(mockStorage)

    const key = ['complex', 'nested', 'key', 'structure']
    const data = new Uint8Array([1, 2, 3, 4, 5])

    await storage.save(key, data)

    // Check that the key was serialized correctly
    const rawData = await mockStorage.get('complex.nested.key.structure')
    t.ok(rawData, 'Should store data with dot-separated key')

    const loaded = await storage.load(key)
    t.ok(loaded, 'Should load data back')
    t.deepEqual(Array.from(loaded!), [1, 2, 3, 4, 5], 'Data should be preserved')
})

test('Simple storage interface - range operations', async t => {
    const mockStorage = new BrowserMockStorage()
    const storage = new SimpleStorageInterface(mockStorage)

    // Save multiple items with same prefix
    await storage.save(['docs', 'doc1', 'chunk1'], new Uint8Array([1, 1]))
    await storage.save(['docs', 'doc1', 'chunk2'], new Uint8Array([1, 2]))
    await storage.save(['docs', 'doc2', 'chunk1'], new Uint8Array([2, 1]))
    await storage.save(['other', 'data'], new Uint8Array([9, 9]))

    const docsRange = await storage.loadRange(['docs'])
    t.equal(docsRange.length, 3, 'Should load 3 items with docs prefix')

    const doc1Range = await storage.loadRange(['docs', 'doc1'])
    t.equal(doc1Range.length, 2, 'Should load 2 items with docs.doc1 prefix')

    // Verify sorting
    t.equal(doc1Range[0].key.join('.'), 'docs.doc1.chunk1',
        'First item should be chunk1')
    t.equal(doc1Range[1].key.join('.'), 'docs.doc1.chunk2',
        'Second item should be chunk2')
})

test('Simple storage interface - remove operations', async t => {
    const mockStorage = new BrowserMockStorage()
    const storage = new SimpleStorageInterface(mockStorage)

    const key = ['temp', 'file']
    const data = new Uint8Array([1, 2, 3])

    await storage.save(key, data)
    let loaded = await storage.load(key)
    t.ok(loaded, 'Should load data before removal')

    await storage.remove(key)
    loaded = await storage.load(key)
    t.equal(loaded, undefined, 'Should return undefined after removal')
})

test('Simple storage interface - removeRange', async t => {
    const mockStorage = new BrowserMockStorage()
    const storage = new SimpleStorageInterface(mockStorage)

    // Save multiple items
    await storage.save(['temp', 'file1'], new Uint8Array([1]))
    await storage.save(['temp', 'file2'], new Uint8Array([2]))
    await storage.save(['keep', 'file'], new Uint8Array([3]))

    await storage.removeRange(['temp'])

    const tempRange = await storage.loadRange(['temp'])
    t.equal(tempRange.length, 0, 'Should have no temp files after removeRange')

    const keepData = await storage.load(['keep', 'file'])
    t.ok(keepData, 'Should still have data with different prefix')
    t.equal(keepData![0], 3, 'Kept data should be intact')
})

test('Simple storage interface - non-existent keys', async t => {
    const mockStorage = new BrowserMockStorage()
    const storage = new SimpleStorageInterface(mockStorage)

    const result = await storage.load(['non', 'existent', 'key'])
    t.equal(result, undefined, 'Should return undefined for non-existent key')

    const range = await storage.loadRange(['empty', 'prefix'])
    t.equal(range.length, 0, 'Should return empty array for non-existent prefix')
})
