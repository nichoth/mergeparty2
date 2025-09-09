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

if (import.meta.env.DEV) {
    localStorage.setItem('DEBUG', 'mergeparty:*')  // application debug
    localStorage.setItem(  // automerge debug
        'debug',
        'automerge-repo:docsync*,automerge-repo:network*,automerge-repo:websocket*'
    )
}

const state = State()

if (import.meta.env.DEV) {
    // @ts-expect-error dev
    window.state = state
}

// Main App Component
const App: FunctionComponent = () => {
    return html`
        <div>
            <header style="margin-bottom: 2rem; text-align: center;">
                <h1>MergeParty Demo</h1>
                ${!import.meta.env.VITE_SERVER_TYPE ? html`
                    <nav style="margin-bottom: 1rem;">
                        <a href="./relay/" style="margin-right: 1rem;">Relay Demo</a>
                        <a href="./storage/">Storage Demo</a>
                    </nav>
                ` : html`
                    <p>Server Type: <strong>${import.meta.env.VITE_SERVER_TYPE}</strong></p>
                    <nav>
                        <a href="../">← Back to Main Demo</a>
                    </nav>
                `}
            </header>
            <${ConnectionForm} state=${state} />
            <${TextEditor} state=${state} />
        </div>
    `
}

// Render the app
render(html`<${App} />`, document.getElementById('root')!)
