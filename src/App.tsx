import React, { useEffect, useRef } from 'react';
import { useGateway } from './hooks/useGateway';
import { Sidebar } from './components/Sidebar';
import { MessageInput } from './components/MessageInput';
import type { ChatMessage } from './types/gateway';

const GATEWAY_URL = '';

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div className={`message-wrapper ${message.role}`}>
      <div className="message-content">
        <div className={`avatar ${message.role}`}>
          {isUser ? 'U' : isSystem ? 'S' : 'AI'}
        </div>
        <div className={`text-body ${message.status === 'denied' ? 'denied' : ''}`}>
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
    selectedModelId,
    setSelectedModelId,
    deleteThread,
    renameThread
  } = useGateway(GATEWAY_URL);

  const scrollRef = useRef<HTMLDivElement>(null);
  const allModels = capabilities?.providers.flatMap(p => p.models) || [];

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
    sendMessage(threadId, text).catch(console.error);
  };

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
        <div className="messages-container" ref={scrollRef}>
          {messages.length === 0 && !activeThreadId && (
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyItems: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '0 40px' }}>
              <div style={{ width: '100%' }}>
                <h1 style={{ color: 'var(--text-main)' }}>Deterministic AI Gateway</h1>
                <p>Start a new chat to begin secure, auditable execution.</p>
              </div>
            </div>
          )}
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>

        <MessageInput
          onSend={handleSend}
          disabled={!capabilities}
          models={allModels}
          selectedModelId={selectedModelId}
          onModelChange={setSelectedModelId}
        />

        {!capabilities && (
          <div className="status-bar">
            Connecting to gateway (port 8010 via proxy)...
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
