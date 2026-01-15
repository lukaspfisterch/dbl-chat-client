import { useState, useEffect, useRef, useCallback } from 'react';
import { GatewayClient } from '../api/gateway';
import type { EventRecord, ChatMessage, Capabilities, IntentEnvelope, IntentEvent, ExecutionEvent, DecisionEvent } from '../types/gateway';
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

    useEffect(() => {
        clientRef.current.getCapabilities()
            .then(caps => setCapabilities(caps))
            .catch(err => console.error("Capabilities fetch failed", err));
    }, []);

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
                const snap = await clientRef.current.getSnapshot(0, 5000);
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

    const sendMessage = async (threadId: string, text: string) => {
        if (!capabilities) return;

        if (hiddenThreads.includes(threadId)) {
            setHiddenThreads(prev => prev.filter(id => id !== threadId));
        }

        const turnId = uuidv4();
        const correlationId = uuidv4();
        const threadMsgs = messages[threadId] || [];
        const parent = threadMsgs.length > 0 ? threadMsgs[threadMsgs.length - 1].turn_id : null;
        const timestamp = new Date().toISOString();

        const requested_model_id = capabilities.providers.flatMap(p => p.models)[0]?.id || 'gpt-4o';

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
            payload: {
                stream_id: 'default',
                lane: 'user',
                actor: 'chat-client',
                intent_type: 'chat.message',
                thread_id: threadId,
                turn_id: turnId,
                parent_turn_id: parent,
                payload: { message: text },
                inputs: { principal_id: 'browser-user' },
                requested_model_id
            }
        };

        try {
            await clientRef.current.postIntent(envelope);
        } catch (err) {
            setMessages(prev => ({
                ...prev,
                [threadId]: (prev[threadId] || []).map(m => m.id === turnId ? { ...m, status: 'transport_error' } : m)
            }));
        }
    };

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
        capabilities,
        messages: activeThreadId ? (messages[activeThreadId] || []) : [],
        activeThreadId,
        setActiveThreadId,
        sendMessage,
        createNewThread,
        deleteThread,
        renameThread,
        projectionError,
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
