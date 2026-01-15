import { useState, useEffect, useRef, useCallback } from 'react';
import { GatewayClient } from '../api/gateway';
import type { EventRecord, ChatMessage, Capabilities, IntentEnvelope } from '../types/gateway';
import { v4 as uuidv4 } from 'uuid';

export function useGateway(baseUrl: string) {
    const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
    const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
    const clientRef = useRef(new GatewayClient(baseUrl));
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
    const [selectedModelId, setSelectedModelId] = useState<string>('gpt-4o');

    // GUI-only state for user comfort, not affecting Gateway
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

    // Load capabilities
    useEffect(() => {
        console.log("Fetching capabilities...");
        clientRef.current.getCapabilities()
            .then(caps => {
                console.log("Capabilities loaded:", caps);
                setCapabilities(caps);
                // Default to first available model if current one isn't in caps
                const allModels = caps.providers.flatMap(p => p.models.map(m => m.id));
                if (allModels.length > 0 && !allModels.includes(selectedModelId)) {
                    setSelectedModelId(allModels[0]);
                }
            })
            .catch(err => {
                console.error("Failed to load capabilities:", err);
            });
    }, []);

    // Event processing logic: derive state from events
    const processEvent = useCallback((event: EventRecord) => {
        if (!event.thread_id) return;

        setMessages(prev => {
            const threadMsgs = prev[event.thread_id!] || [];
            const { kind, payload, turn_id, intent_type } = event;
            const timestamp = event.timestamp || new Date().toISOString();

            // Rule: user message from INTENT
            if (kind === 'INTENT' && (intent_type === 'chat.message' || payload.intent_type === 'chat.message')) {
                const content = payload.payload?.message || payload.message || '';
                if (!content) return prev;

                const newMsg: ChatMessage = {
                    id: turn_id!,
                    role: 'user',
                    content,
                    timestamp,
                    turn_id,
                    status: 'settled'
                };

                // If already exists (optimistic), replace it to update status & timestamp
                if (threadMsgs.some(m => m.id === turn_id)) {
                    return { ...prev, [event.thread_id!]: threadMsgs.map(m => m.id === turn_id ? newMsg : m) };
                }

                return { ...prev, [event.thread_id!]: [...threadMsgs, newMsg] };
            }

            // Rule: assistant message from EXECUTION
            if (kind === 'EXECUTION') {
                if (threadMsgs.some(m => m.id === `${turn_id}-exec` || (m.turn_id === turn_id && m.role === 'assistant'))) return prev;

                let content = payload.output_text;
                let isError = false;

                if (!content && payload.error) {
                    content = `Execution Error: ${payload.error.message || payload.error.code || 'Unknown error'}`;
                    isError = true;
                }

                if (!content && payload.result) {
                    content = typeof payload.result === 'string' ? payload.result : payload.result.text;
                }

                if (!content) return prev;

                const newMsg: ChatMessage = {
                    id: `${turn_id}-exec`,
                    role: 'assistant',
                    content: content,
                    timestamp,
                    turn_id,
                    status: isError ? 'error' : 'settled'
                };

                const updatedThread = threadMsgs.map((m): ChatMessage =>
                    m.turn_id === turn_id && m.role === 'user' ? { ...m, status: isError ? 'error' : 'settled' } : m
                );
                return { ...prev, [event.thread_id!]: [...updatedThread, newMsg] };
            }

            // Rule: DENY decisions as system messages
            if (kind === 'DECISION' && payload.decision === 'DENY') {
                const newMsg: ChatMessage = {
                    id: `${turn_id}-deny`,
                    role: 'system',
                    content: `Decision: DENY - ${payload.reason || 'Policy check failed'}`,
                    timestamp,
                    turn_id,
                    status: 'denied'
                };
                const updatedThread = threadMsgs.map((m): ChatMessage =>
                    m.turn_id === turn_id ? { ...m, status: 'denied' } : m
                );
                return { ...prev, [event.thread_id!]: [...updatedThread, newMsg] };
            }

            return prev;
        });
    }, []);

    // Start Tailing
    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const snap = await clientRef.current.getSnapshot(0, 500);
                snap.events.forEach(processEvent);
            } catch (e) {
                console.error("Initial snapshot failed", e);
            }

            while (active) {
                try {
                    for await (const event of clientRef.current.tail()) {
                        if (!active) break;
                        processEvent(event);
                    }
                } catch (e) {
                    console.error("Tail error, reconnecting...", e);
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        })();
        return () => { active = false; };
    }, [processEvent]);

    const sendMessage = async (threadId: string, text: string) => {
        if (!capabilities) return;

        // Unhide if it was hidden
        if (hiddenThreads.includes(threadId)) {
            setHiddenThreads(prev => prev.filter(id => id !== threadId));
        }

        const turnId = uuidv4();
        const threadMsgs = messages[threadId] || [];
        const parent = threadMsgs.length > 0 ? threadMsgs[threadMsgs.length - 1].turn_id : null;
        const timestamp = new Date().toISOString();

        // Optimistic Update
        const optimisticMsg: ChatMessage = {
            id: turnId,
            role: 'user',
            content: text,
            timestamp,
            turn_id: turnId,
            status: 'pending'
        };
        setMessages(prev => ({
            ...prev,
            [threadId]: [...(prev[threadId] || []), optimisticMsg]
        }));

        const envelope: IntentEnvelope = {
            interface_version: 2,
            correlation_id: uuidv4(),
            payload: {
                stream_id: 'default',
                lane: 'user',
                actor: 'dbl-chat-client',
                intent_type: 'chat.message',
                thread_id: threadId,
                turn_id: turnId,
                parent_turn_id: parent,
                payload: { message: text },
                inputs: {
                    principal_id: 'browser-user',
                    capability: 'chat',
                },
                requested_model_id: selectedModelId
            }
        };

        try {
            await clientRef.current.postIntent(envelope);
        } catch (err) {
            console.error("Failed to post intent:", err);
            // Mark as error
            setMessages(prev => ({
                ...prev,
                [threadId]: (prev[threadId] || []).map(m => m.id === turnId ? { ...m, status: 'error' } : m)
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
        selectedModelId,
        setSelectedModelId,
        deleteThread,
        renameThread,
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
