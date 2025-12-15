import React from 'react';

export default function StatusBar({ stats, onResetLayout }) {
    if (!stats || stats.rows === 0) {
        return null;
    }

    const formatNumber = (num) => {
        if (num === undefined || num === null) return '';
        return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    };

    return (
        <div style={{
            height: '32px',
            borderTop: '1px solid #c4cdd5',
            background: '#f4f6f8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            fontSize: '12px',
            fontWeight: '500',
            color: '#454f5b',
            gap: '20px',
            flexShrink: 0
        }}>
            {/* Reset Layout Button */}
            <button
                onClick={onResetLayout}
                style={{
                    padding: '4px 12px',
                    fontSize: '11px',
                    background: '#fff',
                    border: '1px solid #c4cdd5',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    color: '#454f5b'
                }}
                title="Reset column widths to default"
            >
                ↻ Reset Layout
            </button>

            {/* Stats */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <strong>{stats.rows}</strong> row{stats.rows !== 1 ? 's' : ''} × <strong>{stats.cells}</strong> cells
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🔢 {stats.numericCells} | 📝 {stats.textCells} | ⚠️ {stats.emptyCells}
                </div>

                {stats.min !== undefined && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span>Min: <strong>{formatNumber(stats.min)}</strong></span>
                        <span>Max: <strong>{formatNumber(stats.max)}</strong></span>
                        <span>Avg: <strong>{formatNumber(stats.avg)}</strong></span>
                    </div>
                )}
            </div>
        </div>
    );
}
