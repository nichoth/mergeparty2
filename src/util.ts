export function toU8 (msg:string|ArrayBuffer):Uint8Array {
    if (typeof msg === 'string') return new TextEncoder().encode(msg)
    return msg instanceof ArrayBuffer ? new Uint8Array(msg) : new Uint8Array()
}

// Helper: ensure we send ArrayBuffer (PartyKit accepts ArrayBuffer | string)
export function toArrayBuffer (u8:Uint8Array):ArrayBuffer {
    if (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength) {
        return u8.buffer as ArrayBuffer
    }
    return u8.slice().buffer
}

export function assert(value:boolean, message?:string):asserts value

export function assert<T>(
    value:T|undefined,
    message?:string
):asserts value is T

export function assert (value:any, message = 'Assertion failed') {
    if (value === false || value === null || value === undefined) {
        const error = new Error(trimLines(message))
        error.stack = removeLine(error.stack, 'assert.ts')
        throw error
    }
}

const trimLines = (s: string) => s.split('\n').map(s => s.trim()).join('\n')

const removeLine = (s = '', targetText: string) => {
    return s
        .split('\n').filter(line => !line.includes(targetText))
        .join('\n')
}
