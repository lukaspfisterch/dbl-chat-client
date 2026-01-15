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
    onRename: (id: string, newTitle: string) => void;
    onDelete: (id: string) => void;
}

export const Sidebar: React.FC<Props> = ({
    threads,
    activeThreadId,
    onSelect,
    onNewChat,
    onRename,
    onDelete
}) => {
    const handleRename = (e: React.MouseEvent, id: string, currentTitle: string) => {
        e.stopPropagation();
        const newTitle = prompt('Rename chat:', currentTitle);
        if (newTitle && newTitle.trim()) {
            onRename(id, newTitle.trim());
        }
    };

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this chat? (It will be hidden locally)')) {
            onDelete(id);
        }
    };

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
                        <span className="thread-title">{thread.title}</span>
                        <div className="thread-actions">
                            <button className="action-btn" onClick={(e) => handleRename(e, thread.id, thread.title)} title="Rename">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                            </button>
                            <button className="action-btn" onClick={(e) => handleDelete(e, thread.id)} title="Delete">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
