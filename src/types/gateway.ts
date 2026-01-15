export type EventKind = 'INTENT' | 'DECISION' | 'EXECUTION';

export interface BaseEvent {
    index?: number;
    correlation_id: string;
    thread_id: string;
    turn_id: string;
    digest?: string;
    timestamp?: string;
    event_id?: string;
    created_at?: string;
}

export interface IntentEvent extends BaseEvent {
    kind: 'INTENT';
    intent_type?: string;
    payload: {
        intent_type?: string;
        message?: string;
        payload?: {
            message: string;
        };
    };
}

export interface ExecutionEvent extends BaseEvent {
    kind: 'EXECUTION';
    payload: {
        output_text?: string;
        result?: string | { text: string };
        error?: {
            code: string;
            message: string;
        };
    };
}

export interface DecisionEvent extends BaseEvent {
    kind: 'DECISION';
    payload: {
        decision: 'ALLOW' | 'DENY';
        reason?: string;
    };
}

export interface UnknownEvent extends BaseEvent {
    kind: string;
    payload: unknown;
}

export type EventRecord = IntentEvent | ExecutionEvent | DecisionEvent | UnknownEvent;

export interface Capabilities {
    interface_version: number;
    providers: Array<{
        id: string;
        models: Array<{
            id: string;
            display_name: string;
        }>;
    }>;
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

export type MessageStatus =
    | 'observed_intent'
    | 'observed_execution'
    | 'execution_error'
    | 'observed_deny'
    | 'transport_error';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    turn_id: string;
    correlation_id: string;
    status: MessageStatus;
}
