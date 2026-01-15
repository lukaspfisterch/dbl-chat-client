import React from 'react';

interface Thread {
    id: string;
    title: string;
}

interface Props {
    threads: Thread[];
    activeThreadId: string | null;
    onSelect: (id: string) => void;
    onNewChat: () => void;
}

export const Sidebar: React.FC<Props> = ({ threads, activeThreadId, onSelect, onNewChat }) => {
    return (
        <div className="sidebar">
            <button className="new-chat-btn" onClick={onNewChat}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New Chat
            </button>
            <div className="thread-list">
                {threads.map(thread => (
                    <div
                        key={thread.id}
                        className={`thread-item ${thread.id === activeThreadId ? 'active' : ''}`}
                        onClick={() => onSelect(thread.id)}
                    >
                        {thread.title}
                    </div>
                ))}
            </div>
        </div>
    );
};
