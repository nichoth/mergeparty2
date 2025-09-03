// Polyfill for performance.now in PartyKit environment
// Try multiple approaches to ensure the polyfill reaches the bundled code

// Approach 1: globalThis
if (typeof globalThis.performance === 'undefined') {
    globalThis.performance = { now: () => Date.now() }
}

// Approach 2: global (Node.js style)
if (typeof global !== 'undefined' && typeof global.performance === 'undefined') {
    global.performance = { now: () => Date.now() }
}

// Approach 3: Direct property assignment
try {
    Object.defineProperty(globalThis, 'performance', {
        value: { now: () => Date.now() },
        writable: true,
        configurable: true
    })
} catch (_e) {
    // Ignore if already defined
}

// Approach 4: Try to override any existing partial performance object
if (globalThis.performance && !globalThis.performance.now) {
    globalThis.performance.now = () => Date.now()
}
