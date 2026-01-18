import type { Capabilities, IntentEnvelope, EventRecord } from '../types/gateway';
import { REQUIRED_SURFACES, REQUIRED_INTERFACE_VERSION } from '../types/gateway';

export interface AdmissionError {
    type: 'interface_mismatch' | 'missing_surfaces' | 'network_error';
    message: string;
    details?: string[];
}

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

    /**
     * Admission Gate: Verify gateway compatibility before allowing operations.
     * Returns null if admission passes, or AdmissionError if incompatible.
     */
    async checkAdmission(): Promise<AdmissionError | null> {
        try {
            const caps = await this.getCapabilities();

            // Check interface version
            if (caps.interface_version !== REQUIRED_INTERFACE_VERSION) {
                return {
                    type: 'interface_mismatch',
                    message: `Gateway interface version mismatch. Expected ${REQUIRED_INTERFACE_VERSION}, got ${caps.interface_version}`,
                };
            }

            // Check required surfaces
            const enabledSurfaces = new Set(
                Object.entries(caps.surfaces)
                    .filter(([, enabled]) => enabled)
                    .map(([name]) => name)
            );
            const missingSurfaces = REQUIRED_SURFACES.filter(s => !enabledSurfaces.has(s));

            if (missingSurfaces.length > 0) {
                return {
                    type: 'missing_surfaces',
                    message: `Gateway missing required surfaces: ${missingSurfaces.join(', ')}`,
                    details: missingSurfaces,
                };
            }

            return null; // Admission passed
        } catch (e) {
            return {
                type: 'network_error',
                message: e instanceof Error ? e.message : 'Failed to connect to gateway',
            };
        }
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
        const query = since !== undefined ? `?since=${since}` : '';
        const url = `${this.baseUrl}/tail${query}`;

        const response = await fetch(url);
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
        const url = `${this.baseUrl}/snapshot?offset=${offset}&limit=${limit}`;

        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Snapshot failed');
        return resp.json();
    }
}

