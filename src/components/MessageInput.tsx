import React, { useState, useRef, useEffect } from 'react';

interface Model {
    id: string;
    display_name: string;
}

interface Props {
    onSend: (text: string) => void;
    disabled?: boolean;
    models: Model[];
    selectedModelId: string;
    onModelChange: (id: string) => void;
}

export const MessageInput: React.FC<Props> = ({ onSend, disabled, models, selectedModelId, onModelChange }) => {
    const [text, setText] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSend = () => {
        if (text.trim() && !disabled) {
            onSend(text.trim());
            setText('');
        }
    };

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [text]);

    return (
        <div className="input-area-wrapper">
            <div className="model-selector-container">
                <select
                    className="model-select"
                    value={selectedModelId}
                    onChange={(e) => onModelChange(e.target.value)}
                    disabled={disabled || models.length === 0}
                >
                    {models.length === 0 && <option value="gpt-4o">gpt-4o (default)</option>}
                    {models.map(m => (
                        <option key={m.id} value={m.id}>{m.display_name}</option>
                    ))}
                </select>
            </div>

            <div className="input-area">
                <div className="input-container">
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        placeholder="Type a message..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                    />
                    <button
                        className={`send-btn ${text.trim() ? 'ready' : ''}`}
                        onClick={handleSend}
                        disabled={!text.trim() || disabled}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};
