import React from 'react';

export default function ProgressBar({ progress, message }) {
    if (progress < 0 || progress > 100) return null;

    return (
        <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#fff',
            padding: '24px 32px',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            zIndex: 10000,
            minWidth: '300px'
        }}>
            <div style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#454f5b',
                marginBottom: '12px',
                textAlign: 'center'
            }}>
                {message || 'Loading...'}
            </div>

            <div style={{
                width: '100%',
                height: '8px',
                background: '#e5e7eb',
                borderRadius: '4px',
                overflow: 'hidden'
            }}>
                <div style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #3b82f6, #2563eb)',
                    transition: 'width 0.3s ease',
                    borderRadius: '4px'
                }} />
            </div>

            <div style={{
                fontSize: '12px',
                color: '#6b7280',
                marginTop: '8px',
                textAlign: 'center'
            }}>
                {Math.round(progress)}%
            </div>
        </div>
    );
}
