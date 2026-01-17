import React, { useState, useRef, useEffect } from 'react';
import type { Capabilities } from '../types/gateway';

interface Props {
    onSend: (text: string) => void;
    disabled?: boolean;
    capabilities: Capabilities | null;
    selectedModelId: string | null;
    onModelSelect: (id: string) => void;
}

export const MessageInput: React.FC<Props> = ({ onSend, disabled, capabilities, selectedModelId, onModelSelect }) => {
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
            <div className="input-area">
                <div className="model-selector-container">
                    <select
                        className="model-selector"
                        value={selectedModelId || ''}
                        onChange={(e) => onModelSelect(e.target.value)}
                        disabled={disabled || !capabilities}
                    >
                        {!capabilities && <option>Loading models...</option>}
                        {capabilities?.providers.map(provider => (
                            <optgroup key={provider.id} label={provider.id.toUpperCase()}>
                                {provider.models.map(model => (
                                    <option key={model.id} value={model.id}>
                                        {model.display_name}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                </div>
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
