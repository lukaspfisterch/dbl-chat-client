export type EventKind = 'INTENT' | 'DECISION' | 'EXECUTION' | 'ADMISSION';

export interface EventRecord {
    index: number;
    timestamp: string;
    kind: EventKind;
    correlation_id: string;
    payload: any;
    thread_id?: string;
    turn_id?: string;
    parent_turn_id?: string;
}

export interface Capabilities {
    interface_version: number;
    providers: Array<{ id: string; provider: string }>;
    surfaces: Record<string, boolean>;
}

export interface IntentEnvelope {
    interface_version: number;
    correlation_id: string;
    payload: {
        stream_id: string;
        lane: string;
        actor: string;
        intent_type: 'chat.message';
        thread_id: string;
        turn_id: string;
        parent_turn_id?: string | null;
        payload: {
            message: string;
        };
        inputs: Record<string, any>;
        requested_model_id: string;
    };
}

export interface ChatThread {
    thread_id: string;
    title: string;
    lastUpdate: string;
}

export interface ChatMessage {
    id: string; // turn_id or correlation_id
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    turn_id?: string;
    status: 'pending' | 'settled' | 'denied' | 'error';
}
