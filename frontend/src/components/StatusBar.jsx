import React from 'react';

export default function StatusBar({ stats }) {
    if (!stats || stats.count === 0) {
        return null;
    }

    return (
        <div style={{
            height: '32px',
            borderTop: '1px solid #c4cdd5',
            background: '#f4f6f8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '0 20px',
            fontSize: '12px',
            fontWeight: '500',
            color: '#454f5b',
            gap: '20px',
            flexShrink: 0
        }}>
            <div>Count: <strong>{stats.count}</strong></div>
            {stats.sum !== undefined && (
                <div>Sum: <strong>{stats.sum.toFixed(2)}</strong></div>
            )}
            {stats.avg !== undefined && (
                <div>Average: <strong>{stats.avg.toFixed(2)}</strong></div>
            )}
        </div>
    );
}
