export const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'HEAD, POST, GET, OPTIONS',
    'Access-Control-Allow-Headers':
        'Origin, X-Requested-With, Content-Type, Accept, Authorization',
}

// Message shapes we care about.
export interface BaseMsg {
    type:'join'|'peer'|'request'|'sync';
    senderId?:string;
    targetId?:string;
    // additional fields vary by message type
    [k: string]:unknown;
}

// Join/Peer specifics
export interface JoinMessage extends BaseMsg {
    type:'join';
    supportedProtocolVersions?:string[];
    peerMetadata?:Record<string, unknown>;
}
export interface PeerMessage extends BaseMsg {
    type:'peer';
    selectedProtocolVersion:string;
    peerMetadata?:Record<string, unknown>;
}

export const SUPPORTED_PROTOCOL_VERSION = '1'

// Export the main classes
export { Relay } from './relay.js'
export { WithStorage } from './with-storage.js'
