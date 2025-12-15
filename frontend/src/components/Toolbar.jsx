import React, { useState } from 'react';

export default function Toolbar({ columns, onFilterApply, onReset }) {
    const [col, setCol] = useState('');
    const [op, setOp] = useState('>');
    const [val, setVal] = useState('');

    const [filterLabel, setFilterLabel] = useState('Filters ▼');

    const handleApply = () => {
        if (!col) {
            alert('Please select a column first');
            return;
        }
        onFilterApply({ col, op, val });
        setFilterLabel('Custom Search ▼');
    };

    const handleReset = () => {
        setCol('');
        setVal('');
        setOp('>');
        setFilterLabel('Filters ▼');
        if (onReset) onReset();
    };

    const handlePreset = (type, value) => {
        if (!col) {
            alert('Please select a column first');
            return;
        }

        // For Filter Presets, update UI state so user sees what's happening
        if (type === 'MISSING') {
            setOp('=');
            setVal('NA');
            setFilterLabel('Missing Data ▼');
            onFilterApply({ col, op: '=', val: 'NA' });
        } else if (type === 'HAS_DATA') {
            setOp('!=');
            setVal('NA');
            setFilterLabel('Has Data ▼');
            onFilterApply({ col, op: '!=', val: 'NA' });
        } else if (type === 'SORT_ASC') {
            setFilterLabel('Sorted Asc ▼');
            onFilterApply({ col, op: 'SORT', val: 'ASC' });
        } else if (type === 'SORT_DESC') {
            setFilterLabel('Sorted Desc ▼');
            onFilterApply({ col, op: 'SORT', val: 'DESC' });
        } else if (type === 'TRIM') {
            onFilterApply({ col, op: 'TRIM', val: '' });
            // Trim is an action, usually one-time, maybe don't change label or change to "Trimmed"
            setFilterLabel('Trimmed ▼');
        }
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


            <button onClick={handleApply}>Search</button>

            {/* Filters Dropdown */}
            <div className="dropdown" style={{ position: 'relative', display: 'inline-block', marginLeft: '10px' }}>
                <button className="dropbtn" style={{ background: '#f8f9fa', color: '#333', border: '1px solid #ccc', minWidth: '120px', textAlign: 'left' }}>
                    {filterLabel}
                </button>
                <div className="dropdown-content" style={{ display: 'none', position: 'absolute', right: 0, backgroundColor: '#f9f9f9', minWidth: '160px', boxShadow: '0px 8px 16px 0px rgba(0,0,0,0.2)', zIndex: 1 }}>
                    <a onClick={() => handlePreset('SORT_ASC')}>Sort Ascending</a>
                    <a onClick={() => handlePreset('SORT_DESC')}>Sort Descending</a>
                    <a onClick={() => handlePreset('MISSING')}>Missing Data</a>
                    <a onClick={() => handlePreset('HAS_DATA')}>Has Data</a>
                    <a onClick={() => handlePreset('TRIM')}>Trim Whitespace</a>
                </div>
            </div>

            <button onClick={handleReset} className="reset-btn" style={{ marginLeft: '10px' }}>Reset</button>
        </div>
    );
}
