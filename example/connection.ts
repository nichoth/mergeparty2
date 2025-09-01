import { useSignal, useComputed } from '@preact/signals'
import { html } from 'htm/preact'
import { type FunctionComponent } from 'preact'
import { type AnyDocumentId } from '@substrate-system/automerge-repo-slim'
import { State, type ExampleAppState } from './state.js'
import { statusMessages } from './index.js'

/**
 * Show connection status
 * Controls to connect/disconnect
 */
export const ConnectionForm:FunctionComponent<{
    state:ExampleAppState
}> = ({ state }) => {
    const docId = useSignal('')
    const statusMsg = useComputed(() => statusMessages[state.status.value])

    const handleSubmit = async (ev:SubmitEvent) => {
        ev.preventDefault()
        const form = ev.target as HTMLFormElement
        const formData = new FormData(form)
        const documentId = formData.get('document-id') as AnyDocumentId

        if (state.status.value === 'disconnected') {
            await State.connect(state, documentId)
        } else {
            State.disconnect(state)
        }
    }

    return html`
        <div class="connector">
            <form onsubmit=${handleSubmit}>
                <text-input
                    aria-describedby="doc-id-instructions"
                    display-name="Document ID"
                    title="Document ID"
                    name="document-id"
                    value=${docId.value}
                    onchange=${(ev: any) => {
                        docId.value = ev.target.value
                    }}
                ></text-input>

                <p class="instructions" id="doc-id-instructions">
                    The document ID you want to edit. If you leave this blank,
                    then a new document will be created.
                </p>

                <div
                    class="connection-status"
                    role="status"
                    aria-live="polite"
                    data-status=${state.status.value}
                >
                    <div>
                        <span class="connection-indicator" aria-hidden="true"></span>
                        <span class="connection-text">
                            ${statusMsg}
                        </span>
                    </div>
                    <span class="visually-hidden">
                        WebSocket connection status: ${statusMsg}
                    </span>

                    <button id="connect" type="submit">
                        ${state.status.value === 'connected' ?
                            'Disconnect' :
                            'Connect'
                        }
                    </button>
                </div>
            </form>
            
            ${state.document.value ?
                html`
                    <div class="doc-id">
                        <span class="explanation">Your document ID: </span>
                        ${state.document.value.documentId}
                    </div>
                ` :
                null
            }
        </div>
    `
}

