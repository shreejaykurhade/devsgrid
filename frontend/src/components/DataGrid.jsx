import React, { useState, useRef, useEffect, useMemo } from 'react';

/**
 * Custom Virtualized Grid
 * "Make your own window" implementation.
 * 
 * Features:
 * - O(1) Rendering performance for any dataset size (only renders visible rows)
 * - Native scrolling behavior
 * - Zero external dependencies
 * - Syncs header with horizontal scroll
 */

const ROW_HEIGHT = 45;
const OVERSCAN = 5; // Render extra rows for smooth scrolling

export default function DataGrid({ data, columns }) {
    // 1. Container Refs
    const containerRef = useRef(null);
    const headerRef = useRef(null);

    // 2. Scroll State
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);

    // 3. Setup Resize Observer to know our viewport height
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                setContainerHeight(entry.contentRect.height);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // 4. Handle Scroll
    const handleScroll = (e) => {
        const { scrollTop, scrollLeft } = e.target;
        // Update vertical scroll for virtualization
        setScrollTop(scrollTop);

        // Sync header horizontal scroll directly
        if (headerRef.current) {
            headerRef.current.scrollLeft = scrollLeft;
        }
    };

    if (!data || data.length === 0) {
        return (
            <div className="neo-box error-box">
                NO DATA LOADED. UPLOAD A FILE.
            </div>
        );
    }

    // 5. Column Resizing Logic
    const [colWidths, setColWidths] = useState({});
    const resizingRef = useRef(null); // { colName, startX, startWidth }

    // Start Resize
    const handleResizeStart = (e, colName, currentWidth) => {
        e.preventDefault();
        e.stopPropagation();
        resizingRef.current = {
            colName,
            startX: e.clientX,
            startWidth: currentWidth
        };
        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
        document.body.style.cursor = 'col-resize';
    };

    // Move Resize
    const handleResizeMove = (e) => {
        if (!resizingRef.current) return;
        const { colName, startX, startWidth } = resizingRef.current;
        const diff = e.clientX - startX;
        const newWidth = Math.max(50, startWidth + diff); // Min 50px

        setColWidths(prev => ({
            ...prev,
            [colName]: newWidth
        }));
    };

    // End Resize
    const handleResizeEnd = () => {
        resizingRef.current = null;
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
        document.body.style.cursor = 'default';
    };

    const resetLayout = () => setColWidths({});

    // 6. Calculate Layout
    const columnLayout = useMemo(() => {
        // Fixed Row Number Column
        const rowNumWidth = 60;
        const rowNumCol = {
            name: '#',
            width: rowNumWidth,
            offset: 0,
            isRowNumber: true
        };

        let currentOffset = rowNumWidth;

        // Sampling for Auto-Width defaults
        const sampleSize = Math.min(data.length, 50);
        const sampleData = data.slice(0, sampleSize);

        const mapLayout = columns.map(col => {
            // Check if we have a Custom Width
            const customWidth = colWidths[col];

            let finalWidth;
            if (customWidth) {
                finalWidth = customWidth;
            } else {
                // Auto Calculation
                let maxContentLen = String(col).length;
                for (let i = 0; i < sampleSize; i++) {
                    const val = sampleData[i][col];
                    if (val) {
                        const len = String(val).length;
                        if (len > maxContentLen) maxContentLen = len;
                    }
                }
                const charWidth = 12;
                finalWidth = Math.max(160, Math.min(600, (maxContentLen * charWidth) + 40));
            }

            const item = {
                name: col,
                width: finalWidth,
                offset: currentOffset
            };
            currentOffset += finalWidth;
            return item;
        });

        const layout = [rowNumCol, ...mapLayout];
        return { columns: layout, totalWidth: currentOffset };
    }, [columns, colWidths, data]);

    const { columns: colDefs, totalWidth } = columnLayout;

    // 7. Calculate Virtualization
    const totalHeight = data.length * ROW_HEIGHT;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(
        data.length,
        Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN
    );

    // 8. Generate Visible Rows
    const visibleRows = [];
    for (let i = startIndex; i < endIndex; i++) {
        visibleRows.push({
            index: i,
            data: data[i],
            top: i * ROW_HEIGHT
        });
    }

    const hasCustomLayout = Object.keys(colWidths).length > 0;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>

            {/* RESET BUTTON LAYOVER */}
            {hasCustomLayout && (
                <div style={{
                    position: 'absolute',
                    top: 10,
                    right: 20,
                    zIndex: 100,
                }}>
                    <button
                        className="reset-btn"
                        onClick={resetLayout}
                        style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: '600',
                            borderRadius: '4px'
                        }}
                    >
                        Reset Layout
                    </button>
                </div>
            )}

            {/* STICKY HEADER */}
            <div
                ref={headerRef}
                style={{
                    height: ROW_HEIGHT,
                    overflow: 'hidden',
                    display: 'flex',
                    borderBottom: '1px solid #c4cdd5',
                    background: '#f4f6f8',
                    flexShrink: 0
                }}
            >
                <div style={{ display: 'flex', width: totalWidth }}>
                    {colDefs.map((col) => (
                        <div
                            key={col.name}
                            style={{
                                width: col.width,
                                minWidth: col.width,
                                height: '100%',
                                padding: '0 12px', // Reduce padding
                                borderRight: '1px solid #dfe3e8', // Thin border
                                fontWeight: '600', // Semi-bold
                                color: '#454f5b', // Dark Grey text
                                fontSize: '13px',
                                textTransform: 'none', // Standard casing
                                display: 'flex',
                                alignItems: 'center',
                                boxSizing: 'border-box',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                position: 'relative',
                                userSelect: 'none'
                            }}
                            title={col.name}
                        >
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {col.name}
                            </span>

                            {/* DRAG HANDLE - Hide for Row Number Column */}
                            {!col.isRowNumber && (
                                <div
                                    onMouseDown={(e) => handleResizeStart(e, col.name, col.width)}
                                    style={{
                                        position: 'absolute',
                                        right: 0,
                                        top: 0,
                                        height: '100%',
                                        width: '8px',
                                        cursor: 'col-resize',
                                        zIndex: 10,
                                    }}
                                    className="resize-handle"
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* VIRTUAL BODY */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                style={{
                    flex: 1,
                    overflow: 'auto',
                    position: 'relative',
                    willChange: 'transform',
                    background: '#ffffff'
                }}
            >
                {/* Scroll Phantom */}
                <div style={{ height: totalHeight, width: totalWidth, position: 'relative' }}>

                    {/* Rendered Window */}
                    {visibleRows.map((row) => {
                        // Very subtle striping logic if desired, or plain white
                        // Professional often uses hover, but subtle stripe helps readability
                        const isEven = row.index % 2 === 0;
                        const bg = isEven ? '#ffffff' : '#fcfcfc'; // Extremely subtle stripe

                        return (
                            <div
                                key={row.index}
                                style={{
                                    position: 'absolute',
                                    top: row.top,
                                    left: 0,
                                    width: '100%',
                                    height: ROW_HEIGHT,
                                    display: 'flex',
                                    background: bg,
                                    borderBottom: '1px solid #f0f0f0' // Very light divider
                                }}
                            >
                                {colDefs.map((col, cIndex) => {
                                    // Special Case: Row Number Column
                                    if (col.isRowNumber) {
                                        return (
                                            <div
                                                key={cIndex}
                                                style={{
                                                    width: col.width,
                                                    minWidth: col.width,
                                                    height: '100%',
                                                    padding: '0 12px',
                                                    borderRight: '1px solid #dcdcdc',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center', // Center align numbers
                                                    background: '#f8f9fa', // Slight grey bg
                                                    fontFamily: 'inherit',
                                                    fontSize: '12px',
                                                    fontWeight: '600',
                                                    color: '#6c757d', // Muted text
                                                    userSelect: 'none'
                                                }}
                                            >
                                                {row.index + 1}
                                            </div>
                                        );
                                    }

                                    const rawValue = row.data[col.name];
                                    const isMissing = rawValue === undefined || rawValue === null || rawValue === '';

                                    return (
                                        <div
                                            key={cIndex}
                                            style={{
                                                width: col.width,
                                                minWidth: col.width,
                                                height: '100%',
                                                padding: '0 12px',
                                                borderRight: '1px solid #f0f0f0',
                                                display: 'flex',
                                                alignItems: 'center',
                                                fontFamily: 'inherit',
                                                fontSize: '13px',
                                                fontWeight: isMissing ? '600' : '400',
                                                color: isMissing ? '#d32f2f' : '#212b36',
                                                fontStyle: isMissing ? 'italic' : 'normal',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}
                                            title={!isMissing ? String(rawValue) : 'Missing Data'}
                                        >
                                            {isMissing ? 'NA' : String(rawValue)}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// "Make your own window" - Done.
