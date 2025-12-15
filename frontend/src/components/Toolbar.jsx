import React, { useState } from 'react';

export default function Toolbar({ columns, onFilterApply, onReset }) {
    const [col, setCol] = useState('');
    const [op, setOp] = useState('>');
    const [val, setVal] = useState('');

    const handleApply = () => {
        onFilterApply({ col, op, val });
    };

    const handleReset = () => {
        setCol('');
        setVal('');
        if (onReset) onReset();
    };

    return (
        <div className="toolbar">
            <select value={col} onChange={e => setCol(e.target.value)}>
                <option value="">Select Column</option>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select value={op} onChange={e => setOp(e.target.value)}>
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
                <option value="=">=</option>
                <option value="!=">!=</option>
                <option value="contains">contains</option>
            </select>

            <input
                type="text"
                placeholder="Value"
                value={val}
                onChange={e => setVal(e.target.value)}
            />

            <button onClick={handleApply}>Filter</button>
            <button onClick={handleReset} className="reset-btn">Reset</button>
        </div>
    );
}
