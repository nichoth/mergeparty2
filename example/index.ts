import { html } from 'htm/preact'
import '@substrate-system/text-input'
import { type FunctionComponent, render } from 'preact'
import { ConnectionForm } from './connection.js'
import { State } from './state.js'
import { TextEditor } from './text-editor.js'

export const statusMessages = {
    connecting: 'Connecting to server...',
    connected: 'Connected',
    disconnected: 'Disconnected'
}

localStorage.setItem('DEBUG', 'mergeparty:*')  // application debug
localStorage.setItem(  // automerge debug
    'debug',
    'automerge-repo:docsync,automerge-repo:network*,automerge-repo:websocket*'
)

const state = State()

if (import.meta.env.DEV) {
    // @ts-expect-error dev
    window.state = state
}

// Main App Component
const App: FunctionComponent = () => {
    return html`
        <div>
            <${ConnectionForm} state=${state} />
            <${TextEditor} state=${state} />
        </div>
    `
}

// Render the app
render(html`<${App} />`, document.getElementById('root')!)
