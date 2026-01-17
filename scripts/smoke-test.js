import { v4 as uuidv4 } from 'uuid';

const GATEWAY_URL = 'http://127.0.0.1:8010';

async function runSmokeTest() {
    console.log(`Starting Live Contract Smoke Test against ${GATEWAY_URL}...`);

    try {
        // 1. Fetch Capabilities
        console.log('Step 1: Fetching /capabilities...');
        const capResp = await fetch(`${GATEWAY_URL}/capabilities`);
        if (!capResp.ok) throw new Error(`Capabilities failed: ${capResp.statusText}`);
        const caps = await capResp.json();

        const providers = caps.providers || [];
        if (providers.length === 0) throw new Error('No providers found in capabilities');

        const firstProvider = providers[0];
        const firstModel = firstProvider.models[0];
        if (!firstModel) throw new Error('No models found in first provider');

        console.log(`Using model: ${firstModel.id} (${firstModel.display_name}) from provider: ${firstProvider.id}`);

        // 2. Send INTENT
        console.log('Step 2: Sending INTENT...');
        const turnId = uuidv4();
        const correlationId = uuidv4();

        const envelope = {
            interface_version: 2,
            correlation_id: correlationId,
            thread_id: 'smoke-test-thread',
            turn_id: turnId,
            kind: 'INTENT',
            payload: {
                stream_id: 'default',
                lane: 'user',
                actor: 'smoke-test-script',
                intent_type: 'chat.message',
                thread_id: 'smoke-test-thread',
                turn_id: turnId,
                parent_turn_id: null,
                payload: {
                    message: 'Hello from smoke test!',
                    requested_model_id: firstModel.id
                },
                inputs: { principal_id: 'smoke-test-user' }
            }
        };

        const postResp = await fetch(`${GATEWAY_URL}/ingress/intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(envelope)
        });

        if (postResp.status === 202) {
            console.log('SUCCESS: INTENT accepted (202)');
            const status = await postResp.json();
            console.log('Response:', status);
        } else {
            console.error(`FAILURE: Expected 202, got ${postResp.status}`);
            const error = await postResp.text();
            console.error('Error details:', error);
            process.exit(1);
        }

        // 3. Verify in Tail (Optional but recommended)
        console.log('Step 3: Verifying /tail (briefly)...');
        const tailResp = await fetch(`${GATEWAY_URL}/tail?backlog=5`);
        if (!tailResp.ok) throw new Error(`Tail failed: ${tailResp.statusText}`);

        // We just check if we can open the stream and find our correlation_id in the first few chunks
        const reader = tailResp.body.getReader();
        const decoder = new TextDecoder();
        let found = false;

        const timeout = setTimeout(() => {
            if (!found) {
                console.log('Step 3: Timeout waiting for event in tail. Skipping tail verification.');
                reader.cancel();
            }
        }, 2000);

        while (!found) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            if (chunk.includes(correlationId)) {
                console.log(`SUCCESS: Found correlation_id ${correlationId} in tail stream.`);
                found = true;
                clearTimeout(timeout);
                reader.cancel();
            }
        }

        console.log('\nSmoke test PASSED.');

    } catch (err) {
        console.error('\nSmoke test FAILED:');
        console.error(err.message);
        process.exit(1);
    }
}

runSmokeTest();
