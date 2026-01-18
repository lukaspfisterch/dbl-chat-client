import React, { useEffect, useRef, useState } from 'react';
import { useGateway } from './hooks/useGateway';
import { Sidebar } from './components/Sidebar';
import { MessageInput } from './components/MessageInput';
import type { ChatMessage } from './types/gateway';

const GATEWAY_URL = '';

// Turn Details Panel (Operator Mode)
const TurnDetails: React.FC<{ message: ChatMessage; onClose: () => void }> = ({ message, onClose }) => (
  <div className="turn-details-panel">
    <div className="turn-details-header">
      <span>Turn Details</span>
      <button onClick={onClose} className="close-btn">×</button>
    </div>
    <div className="turn-details-content">
      <div className="detail-row">
        <span className="detail-label">turn_id</span>
        <code className="detail-value">{message.turn_id}</code>
      </div>
      <div className="detail-row">
        <span className="detail-label">correlation_id</span>
        <code className="detail-value">{message.correlation_id}</code>
      </div>
      <div className="detail-row">
        <span className="detail-label">status</span>
        <code className={`detail-value status-${message.status}`}>{message.status}</code>
      </div>
      {message.context_digest && (
        <div className="detail-row">
          <span className="detail-label">context_digest</span>
          <code className="detail-value digest">{message.context_digest.substring(0, 24)}...</code>
        </div>
      )}
      {message.decision_digest && (
        <div className="detail-row">
          <span className="detail-label">decision_digest</span>
          <code className="detail-value digest">{message.decision_digest.substring(0, 24)}...</code>
        </div>
      )}
      {message.reason_codes && message.reason_codes.length > 0 && (
        <div className="detail-row">
          <span className="detail-label">reason_codes</span>
          <code className="detail-value">{message.reason_codes.join(', ')}</code>
        </div>
      )}
    </div>
  </div>
);

const MessageBubble: React.FC<{ message: ChatMessage; onShowDetails: () => void }> = ({ message, onShowDetails }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div className={`message-wrapper ${message.role}`} onClick={onShowDetails}>
      <div className="message-content">
        <div className={`avatar ${message.role}`}>
          {isUser ? 'U' : isSystem ? 'S' : 'AI'}
        </div>
        <div className={`text-body ${message.status === 'observed_deny' ? 'denied' : ''} ${message.status === 'transport_error' || message.status === 'execution_error' ? 'error' : ''}`}>
          {message.content}
        </div>
      </div>
    </div>
  );
};

function App() {
  const {
    messages,
    threads,
    activeThreadId,
    setActiveThreadId,
    sendMessage,
    createNewThread,
    capabilities,
    deleteThread,
    renameThread,
    projectionError,
    selectedModelId,
    setSelectedModelId,
    connectionState,
    admissionError
  } = useGateway(GATEWAY_URL);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Context is ON by default
  const [includeContext, setIncludeContext] = useState(true);
  // Default N = 10, range 1-20
  const [contextN, setContextN] = useState(10);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (text: string) => {
    let threadId = activeThreadId;
    if (!threadId) {
      threadId = createNewThread();
    }

    // Build declarative context options
    const contextOptions = includeContext ? {
      contextMode: 'first_plus_last_n',
      contextN: contextN
    } : {
      contextMode: 'none'
    };

    sendMessage(threadId, text, contextOptions).catch(console.error);
  };

  const selectedMessage = messages.find(m => m.id === selectedMessageId);
  const isConnected = connectionState === 'connected';
  const hasCompletedTurns = messages.some(m => m.role === 'assistant');

  return (
    <div className="app-container">
      <Sidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onSelect={setActiveThreadId}
        onNewChat={() => createNewThread()}
        onRename={renameThread}
        onDelete={deleteThread}
      />

      <main className="main-view">
        {/* Connection Status Bar */}
        {connectionState !== 'connected' && (
          <div className={`connection-bar ${connectionState}`}>
            {connectionState === 'connecting' && '🔄 Connecting to gateway...'}
            {connectionState === 'checking_capabilities' && '🔍 Checking capabilities...'}
            {connectionState === 'error' && `❌ ${admissionError?.message || 'Connection failed'}`}
            {connectionState === 'disconnected' && '⚪ Disconnected'}
          </div>
        )}

        <div className="messages-container" ref={scrollRef}>
          {messages.length === 0 && !activeThreadId && (
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyItems: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '0 40px' }}>
              <div style={{ width: '100%' }}>
                <h1 style={{ color: 'var(--text-main)' }}>AI Gateway</h1>
                <p>Start a new chat to begin secure, auditable execution.</p>
              </div>
            </div>
          )}
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onShowDetails={() => setSelectedMessageId(selectedMessageId === msg.id ? null : msg.id)}
            />
          ))}
        </div>

        {/* Turn Details Panel (Operator Mode) */}
        {selectedMessage && (
          <TurnDetails
            message={selectedMessage}
            onClose={() => setSelectedMessageId(null)}
          />
        )}

        {/* Context Controls and Input */}
        <div className="input-area">
          <div className="context-options">
            <label className={`context-checkbox ${!hasCompletedTurns ? 'no-context' : ''}`}>
              <input
                type="checkbox"
                checked={includeContext}
                onChange={(e) => setIncludeContext(e.target.checked)}
              />
              <span>
                Include context
                {!hasCompletedTurns && ' (no completed turns yet)'}
              </span>
            </label>
            {includeContext && (
              <div className="context-n-control">
                <label>
                  Last N:
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={contextN}
                    onChange={(e) => setContextN(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                    className="context-n-input"
                  />
                </label>
              </div>
            )}
          </div>
          <MessageInput
            onSend={handleSend}
            disabled={!isConnected}
            capabilities={capabilities}
            selectedModelId={selectedModelId}
            onModelSelect={setSelectedModelId}
          />
        </div>

        {projectionError && (
          <div className="status-bar error">
            {projectionError}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

