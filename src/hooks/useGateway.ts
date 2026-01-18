import { useState, useEffect, useRef, useCallback } from 'react';
import { GatewayClient } from '../api/gateway';
import type { AdmissionError } from '../api/gateway';
import type { EventRecord, ChatMessage, Capabilities, IntentEnvelope, IntentEvent, ExecutionEvent, DecisionEvent, ConnectionState, DeclaredRef } from '../types/gateway';
import { v4 as uuidv4 } from 'uuid';

export function useGateway(baseUrl: string) {
    const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
    const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
    const clientRef = useRef(new GatewayClient(baseUrl));
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
    const [projectionError, setProjectionError] = useState<string | null>(null);

    const seenEvents = useRef<Set<string>>(new Set());
    const dedupeQueue = useRef<string[]>([]);

    const [customTitles, setCustomTitles] = useState<Record<string, string>>(() => {
        const saved = localStorage.getItem('dbl_custom_titles');
        return saved ? JSON.parse(saved) : {};
    });
    const [hiddenThreads, setHiddenThreads] = useState<string[]>(() => {
        const saved = localStorage.getItem('dbl_hidden_threads');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        localStorage.setItem('dbl_custom_titles', JSON.stringify(customTitles));
    }, [customTitles]);

    useEffect(() => {
        localStorage.setItem('dbl_hidden_threads', JSON.stringify(hiddenThreads));
    }, [hiddenThreads]);

    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const hasInitializedModel = useRef(false);

    // Admission Gate state
    const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
    const [admissionError, setAdmissionError] = useState<AdmissionError | null>(null);

    // Admission Gate: Check capabilities and compatibility on mount
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setConnectionState('connecting');
            const error = await clientRef.current.checkAdmission();
            if (cancelled) return;

            if (error) {
                setAdmissionError(error);
                setConnectionState('error');
                console.error('Admission Gate failed:', error.message);
                return;
            }

            // Admission passed, fetch full capabilities
            setConnectionState('checking_capabilities');
            try {
                const caps = await clientRef.current.getCapabilities();
                if (cancelled) return;
                setCapabilities(caps);
                setConnectionState('connected');
            } catch (err) {
                if (cancelled) return;
                setAdmissionError({
                    type: 'network_error',
                    message: err instanceof Error ? err.message : 'Failed to fetch capabilities',
                });
                setConnectionState('error');
            }
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (capabilities && !hasInitializedModel.current && capabilities.providers.length > 0) {
            const firstModel = capabilities.providers[0].models[0]?.id;
            if (firstModel) {
                setSelectedModelId(firstModel);
                hasInitializedModel.current = true;
            }
        }
    }, [capabilities]);

    const processEvent = useCallback((event: EventRecord) => {
        try {
            const dedupeKey = event.digest ||
                (event.index !== undefined ? `${event.thread_id}|${event.turn_id}|${event.kind}|${event.index}` :
                    (event.event_id || event.created_at ? `${event.thread_id}|${event.turn_id}|${event.kind}|${event.event_id || event.created_at}` : null));

            if (dedupeKey) {
                if (seenEvents.current.has(dedupeKey)) return;
                seenEvents.current.add(dedupeKey);
                dedupeQueue.current.push(dedupeKey);
                if (dedupeQueue.current.length > 10000) {
                    const oldest = dedupeQueue.current.shift();
                    if (oldest) seenEvents.current.delete(oldest);
                }
            }

            if (!event.thread_id) return;

            setMessages(prev => {
                const threadMsgs = prev[event.thread_id!] || [];
                const timestamp = event.timestamp || new Date().toISOString();

                switch (event.kind) {
                    case 'INTENT': {
                        const intent = event as IntentEvent;
                        const intentType = intent.intent_type || intent.payload.intent_type;
                        if (intentType !== 'chat.message') return prev;

                        const content = intent.payload.payload?.message || intent.payload.message || '';
                        if (!content) return prev;

                        // Tie to turn_id AND correlation_id
                        const exists = threadMsgs.some(m => m.turn_id === intent.turn_id || m.correlation_id === intent.correlation_id);
                        if (exists) {
                            return {
                                ...prev,
                                [event.thread_id]: threadMsgs.map(m => (m.turn_id === intent.turn_id || m.correlation_id === intent.correlation_id)
                                    ? { ...m, content, timestamp, status: 'observed_intent' } : m)
                            };
                        }

                        return {
                            ...prev,
                            [event.thread_id]: [...threadMsgs, {
                                id: intent.turn_id,
                                role: 'user',
                                content,
                                timestamp,
                                turn_id: intent.turn_id,
                                correlation_id: intent.correlation_id,
                                status: 'observed_intent'
                            }]
                        };
                    }

                    case 'EXECUTION': {
                        const exec = event as ExecutionEvent;
                        const execId = `${exec.correlation_id}-exec`; // Use correlation_id for assistant output tracing
                        if (threadMsgs.some(m => m.id === execId)) return prev;

                        let content = exec.payload.output_text;
                        let outcomeStatus: 'observed_execution' | 'execution_error' = 'observed_execution';

                        if (!content && exec.payload.error) {
                            content = `Execution Error: ${exec.payload.error.message || exec.payload.error.code}`;
                            outcomeStatus = 'execution_error';
                        }

                        if (!content && exec.payload.result) {
                            content = typeof exec.payload.result === 'string' ? exec.payload.result : exec.payload.result.text;
                        }

                        if (!content) return prev;

                        return {
                            ...prev,
                            [event.thread_id]: [...threadMsgs, {
                                id: execId,
                                role: 'assistant',
                                content,
                                timestamp,
                                turn_id: exec.turn_id,
                                correlation_id: exec.correlation_id,
                                status: outcomeStatus
                            }]
                        };
                    }

                    case 'DECISION': {
                        const decision = event as DecisionEvent;
                        if (decision.payload.decision === 'DENY') {
                            const denyId = `${decision.correlation_id}-deny`;
                            if (threadMsgs.some(m => m.id === denyId)) return prev;

                            // Correlate with user message via turn_id OR correlation_id
                            const updatedThread = threadMsgs.map((m): ChatMessage =>
                                (m.turn_id === decision.turn_id || m.correlation_id === decision.correlation_id) && m.role === 'user'
                                    ? { ...m, status: 'observed_deny' } : m
                            );

                            return {
                                ...prev,
                                [event.thread_id]: [...updatedThread, {
                                    id: denyId,
                                    role: 'system',
                                    content: `Decision: DENY - ${decision.payload.reason || 'Policy check failed'}`,
                                    timestamp,
                                    turn_id: decision.turn_id,
                                    correlation_id: decision.correlation_id,
                                    status: 'observed_deny'
                                }]
                            };
                        }
                        return prev;
                    }

                    default:
                        return prev;
                }
            });

            if (projectionError) setProjectionError(null);

        } catch (e) {
            console.error("Projection error", e);
            setProjectionError("Local event projection failed. Interface synchronization may be degraded.");
        }
    }, [projectionError]);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const snap = await clientRef.current.getSnapshot(0, 2000);
                snap.events.forEach(processEvent);
            } catch (e) {
                console.error("Snapshot failure", e);
            }

            while (active) {
                try {
                    for await (const event of clientRef.current.tail()) {
                        if (!active) break;
                        processEvent(event);
                    }
                } catch (e) {
                    if (active) await new Promise(r => setTimeout(r, 2000));
                }
            }
        })();
        return () => { active = false; };
    }, [processEvent]);

    const sendMessage = useCallback(async (
        threadId: string,
        text: string,
        contextRefs?: DeclaredRef[]
    ) => {
        // Admission Gate: Block if not connected
        if (connectionState !== 'connected') {
            console.warn('Cannot send message: Gateway not connected');
            return;
        }
        if (!capabilities || !selectedModelId) return;

        if (hiddenThreads.includes(threadId)) {
            setHiddenThreads(prev => prev.filter(id => id !== threadId));
        }

        const turnId = uuidv4();
        const correlationId = uuidv4();
        const threadMsgs = messages[threadId] || [];
        const parent = threadMsgs.length > 0 ? threadMsgs[threadMsgs.length - 1].turn_id : null;
        const timestamp = new Date().toISOString();

        setMessages(prev => ({
            ...prev,
            [threadId]: [...(prev[threadId] || []), {
                id: turnId,
                role: 'user',
                content: text,
                timestamp,
                turn_id: turnId,
                correlation_id: correlationId,
                status: 'observed_intent'
            }]
        }));

        const envelope: IntentEnvelope = {
            interface_version: 2,
            correlation_id: correlationId,
            thread_id: threadId,
            turn_id: turnId,
            kind: 'INTENT',
            payload: {
                stream_id: 'default',
                lane: 'user',
                actor: 'chat-client',
                intent_type: 'chat.message',
                thread_id: threadId,
                turn_id: turnId,
                parent_turn_id: parent,
                payload: {
                    message: text,
                    requested_model_id: selectedModelId
                },
                requested_model_id: selectedModelId,
                inputs: {
                    principal_id: 'browser-user',
                    capability: 'chat',
                    model_id: selectedModelId,
                },
                // Include declared_refs if provided (for context building)
                ...(contextRefs && contextRefs.length > 0 ? { declared_refs: contextRefs } : {})
            }
        };

        console.log('[DEBUG] Submitting INTENT');
        console.log('[DEBUG] selectedModelId:', selectedModelId);
        console.log('[DEBUG] declared_refs:', contextRefs || 'none');

        try {
            await clientRef.current.postIntent(envelope);
        } catch (err) {
            setMessages(prev => ({
                ...prev,
                [threadId]: (prev[threadId] || []).map(m => m.id === turnId ? { ...m, status: 'transport_error' } : m)
            }));
        }
    }, [connectionState, capabilities, selectedModelId, messages, hiddenThreads]);

    const createNewThread = () => {
        const id = uuidv4();
        setActiveThreadId(id);
        return id;
    };

    const deleteThread = (id: string) => {
        setHiddenThreads(prev => [...prev.filter(i => i !== id), id]);
        if (activeThreadId === id) setActiveThreadId(null);
    };

    const renameThread = (id: string, title: string) => {
        setCustomTitles(prev => ({ ...prev, [id]: title }));
    };

    return {
        // Connection state (Admission Gate)
        connectionState,
        admissionError,
        // Capabilities
        capabilities,
        messages: activeThreadId ? (messages[activeThreadId] || []) : [],
        activeThreadId,
        setActiveThreadId,
        sendMessage,
        createNewThread,
        deleteThread,
        renameThread,
        projectionError,
        selectedModelId,
        setSelectedModelId,
        threads: Object.keys(messages)
            .filter(id => !hiddenThreads.includes(id))
            .map(id => {
                const threadMsgs = messages[id] || [];
                const lastMsg = threadMsgs[threadMsgs.length - 1];
                return {
                    id,
                    title: customTitles[id] || threadMsgs[0]?.content.substring(0, 30) || 'New Thread',
                    lastUpdate: lastMsg?.timestamp || ''
                };
            }).sort((a, b) => (b.lastUpdate || '').localeCompare(a.lastUpdate || ''))
    };
}
