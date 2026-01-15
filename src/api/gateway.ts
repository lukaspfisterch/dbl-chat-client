import type { Capabilities, IntentEnvelope, EventRecord } from '../types/gateway';

export class GatewayClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    async getCapabilities(): Promise<Capabilities> {
        const resp = await fetch(`${this.baseUrl}/capabilities`);
        if (!resp.ok) throw new Error('Failed to fetch capabilities');
        return resp.json();
    }

    async postIntent(envelope: IntentEnvelope): Promise<void> {
        const resp = await fetch(`${this.baseUrl}/ingress/intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(envelope),
        });
        if (!resp.ok) throw new Error(`Intent failed: ${resp.statusText}`);
    }

    async *tail(since?: number): AsyncIterableIterator<EventRecord> {
        const url = new URL(`${this.baseUrl}/tail`);
        if (since !== undefined) url.searchParams.set('since', since.toString());

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error('Tail stream failed');
        if (!response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data:')) {
                    try {
                        yield JSON.parse(trimmed.slice(5).trim());
                    } catch (e) {
                        console.error('Failed to parse SSE line', e);
                    }
                }
            }
        }
    }

    async getSnapshot(offset = 0, limit = 100): Promise<{ events: EventRecord[], length: number }> {
        const url = new URL(`${this.baseUrl}/snapshot`);
        url.searchParams.set('offset', offset.toString());
        url.searchParams.set('limit', limit.toString());

        const resp = await fetch(url.toString());
        if (!resp.ok) throw new Error('Snapshot failed');
        return resp.json();
    }
}
