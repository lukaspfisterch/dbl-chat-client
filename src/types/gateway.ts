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

// Boundary block for DECISION events (v0.4.0+)
export interface DecisionBoundary {
    context_config_digest?: string;
}

export interface DecisionEvent extends BaseEvent {
    kind: 'DECISION';
    payload: {
        decision: 'ALLOW' | 'DENY';
        reason?: string;
        reason_codes?: string[];
        context_digest?: string;
        boundary?: DecisionBoundary;
    };
}

export interface UnknownEvent extends BaseEvent {
    kind: string;
    payload: unknown;
}

export type EventRecord = IntentEvent | ExecutionEvent | DecisionEvent | UnknownEvent;

// Declared reference for context building
export interface DeclaredRef {
    ref_type: 'event' | 'turn' | 'digest';
    ref_id: string;
    version?: string | null;
}

export interface Capabilities {
    interface_version: number;
    providers: Array<{
        id: string;
        models: Array<{
            id: string;
            display_name: string;
            health?: {
                status: 'ok' | 'unhealthy' | 'unknown';
                checked_at?: string;
            };
        }>;
    }>;
    surfaces: Record<string, boolean>;
}


// Required surfaces for chat client to function
export const REQUIRED_SURFACES = ['snapshot', 'ingress_intent', 'tail'] as const;
export const REQUIRED_INTERFACE_VERSION = 2;

// Connection state for admission gate
export type ConnectionState =
    | 'disconnected'
    | 'connecting'
    | 'checking_capabilities'
    | 'connected'
    | 'error';

// Semantic connection state (derived, user-facing)
export type SemanticConnectionState =
    | 'ready'       // connected + capabilities + ≥1 healthy model
    | 'degraded'    // connected, but some providers unhealthy
    | 'unavailable' // no providers or no policy (observer mode)
    | 'connecting'
    | 'disconnected'
    | 'error';

export interface IntentEnvelope {
    interface_version: number;
    correlation_id: string;
    thread_id: string;
    turn_id: string;
    kind: 'INTENT';
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
            requested_model_id: string;
        };
        requested_model_id: string;
        inputs: Record<string, string | number | boolean | null>;
        declared_refs?: DeclaredRef[];
        context_mode?: string;
        context_n?: number;
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
    // Decision metadata (for DECISION events)
    decision_digest?: string;
    context_digest?: string;
    reason_codes?: string[];
}

