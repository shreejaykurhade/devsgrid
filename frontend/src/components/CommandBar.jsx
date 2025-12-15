import React, { useState } from 'react';

export default function CommandBar({ onCommand }) {
    const [cmd, setCmd] = useState('');

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            onCommand(cmd);
        }
    };

    return (
        <div className="command-bar">
            <input
                id="cli-input"
                name="cli-input"
                type="text"
                value={cmd}
                onChange={e => setCmd(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter command (e.g. FILTER salary > 50000, SORT age DESC)"
            />
            <button onClick={() => onCommand(cmd)}>Run</button>
        </div>
    );
}
