import { useState, useEffect, useRef, useCallback } from 'react';
import { GatewayClient } from '../api/gateway';
import type { EventRecord, ChatMessage, Capabilities, IntentEnvelope } from '../types/gateway';
import { v4 as uuidv4 } from 'uuid';

export function useGateway(baseUrl: string) {
    const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
    const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
    const clientRef = useRef(new GatewayClient(baseUrl));
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

    // Load capabilities
    useEffect(() => {
        clientRef.current.getCapabilities().then(setCapabilities).catch(console.error);
    }, []);

    // Event processing logic: derive state from events
    const processEvent = useCallback((event: EventRecord) => {
        if (!event.thread_id) return;

        setMessages(prev => {
            const threadMsgs = prev[event.thread_id!] || [];
            const { kind, payload, turn_id, timestamp } = event;

            // Rule: user message from INTENT
            if (kind === 'INTENT' && payload.intent_type === 'chat.message') {
                // Avoid duplicates
                if (threadMsgs.some(m => m.id === turn_id)) return prev;
                const newMsg: ChatMessage = {
                    id: turn_id!,
                    role: 'user',
                    content: payload.payload.message || '',
                    timestamp,
                    turn_id,
                    status: 'pending'
                };
                return { ...prev, [event.thread_id!]: [...threadMsgs, newMsg] };
            }

            // Rule: assistant message from EXECUTION
            if (kind === 'EXECUTION' && payload.output_text) {
                // Find existing message by correlation_id or turn_id to update status if needed
                // But for EXECUTION, we usually create/update the "settled" message
                if (threadMsgs.some(m => m.turn_id === turn_id && m.role === 'assistant')) return prev;

                const newMsg: ChatMessage = {
                    id: `${turn_id}-exec`,
                    role: 'assistant',
                    content: payload.output_text,
                    timestamp,
                    turn_id,
                    status: 'settled'
                };

                // Update user message status to settled if matching turn_id
                const updatedThread = threadMsgs.map((m): ChatMessage =>
                    m.turn_id === turn_id && m.role === 'user' ? { ...m, status: 'settled' } : m
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
                // Update user message status
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
            // First, get snapshot (optional for initial backlog)
            try {
                const snap = await clientRef.current.getSnapshot(0, 500);
                snap.events.forEach(processEvent);
            } catch (e) {
                console.error("Initial snapshot failed", e);
            }

            // Then tail
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

        const turnId = uuidv4();
        const threadMsgs = messages[threadId] || [];
        const parent = threadMsgs.length > 0 ? threadMsgs[threadMsgs.length - 1].turn_id : null;

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
                requested_model_id: capabilities.providers[0]?.id || 'gpt-4o'
            }
        };

        await clientRef.current.postIntent(envelope);
    };

    const createNewThread = () => {
        const id = uuidv4();
        setActiveThreadId(id);
        return id;
    };

    return {
        capabilities,
        messages: activeThreadId ? (messages[activeThreadId] || []) : [],
        activeThreadId,
        setActiveThreadId,
        sendMessage,
        createNewThread,
        threads: Object.keys(messages).map(id => ({
            id,
            title: messages[id][0]?.content.substring(0, 30) || 'New Thread',
            lastUpdate: messages[id][messages[id].length - 1]?.timestamp
        })).sort((a, b) => b.lastUpdate.localeCompare(a.lastUpdate))
    };
}
