import { useSignal, useComputed, useSignalEffect } from '@preact/signals'
import { html } from 'htm/preact'
import { useCallback } from 'preact/hooks'
import { type FunctionComponent } from 'preact'
import { type ExampleAppState, State } from './state.js'
import Debug from '@substrate-system/debug'
const debug = Debug('mergeparty:view')

/**
 * __Text Editor Component__
 *
 * Listen for changes in the textarea element,
 * listen for changes in the automerge doc,
 * update text area when doc changes
 * update doc when textarea changes
 */
export const TextEditor:FunctionComponent<{
    state:ExampleAppState
}> = ({ state }) => {
    const inputRefSignal = useSignal<HTMLTextAreaElement|null>(null)

    const setRef = (node) => {
        // This function runs when the ref is set or unset.
        inputRefSignal.value = node
    }

    /**
     * Listen for document changes, update the textarea.
     */
    useSignalEffect(() => {
        const handle = state.document.value
        if (!handle) return
        if (!inputRefSignal.value) return
        debug('Setting up document change listener for document:', handle.documentId);

        (async () => {
            if (!inputRefSignal.value) return
            const doc = await handle.doc()
            debug('the doc content..........', doc)
            inputRefSignal.value.value = doc.text
        })()

        handle.on('change', onChange)

        function onChange () {
            if (!handle) return
            const doc = handle.doc()
            const currentValue = doc?.text || ''
            if (!inputRefSignal.value) return
            inputRefSignal.value.value = currentValue
            debug('Document changed! New value:', currentValue)
            if (inputRefSignal.value.value !== currentValue) {
                debug(
                    'Updating textarea from',
                    inputRefSignal.value.value,
                    'to',
                    currentValue
                )

                if (inputRefSignal.value.value !== currentValue) {
                    inputRefSignal.value.value = currentValue
                }
            }
        }

        return () => handle.off('change', onChange)
    })

    /**
     * Listen for textarea changes, update the document.
     */
    const handleInput = useCallback((ev:InputEvent) => {
        const textarea = ev.target as HTMLTextAreaElement
        const newValue = textarea.value
        State.updateDoc(state, newValue)
    }, [])

    // const isConnected = state.status.value === 'connected'
    const isConnected = useComputed(() => {
        return state.status.value === 'connected'
    })

    return html`
        <form class="textarea">
            <textarea 
                ref=${setRef}
                name="text" 
                id="text"
                oninput=${handleInput}
                disabled=${!isConnected.value}
            ></textarea>
        </form>
    `
}

