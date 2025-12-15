import React, { useRef, useEffect, useMemo, useState } from 'react';
import useDataGridLogic from '../hooks/useDataGridLogic';

/**
 * Custom Virtualized Grid
 * "Make your own window" implementation.
 */

const ROW_HEIGHT = 45;
const OVERSCAN = 5;

export default function DataGrid({ data, columns, onCellEdit, onSelectionChange, onDeleteRow, onDeleteRows }) {
    // 1. Container Refs
    const containerRef = useRef(null);
    const headerRef = useRef(null);

    // --- USE CUSTOM HOOK FOR LOGIC ---
    const {
        selectedRows,
        editingCell,
        pinnedRows,
        hiddenColumns,
        frozenColumns,
        contextMenu,
        rowContextMenu,
        editInputRef,
        isDragging,

        setHiddenColumns,

        handleRowClick,
        handleRowMouseDown,
        handleRowMouseEnter,
        handleCellDoubleClick,
        saveEdit,
        cancelEdit, // Correctly exported now
        handleEditChange,
        handleEditKeyDown,
        getColumnDataType,
        handleHeaderRightClick,
        hideColumn,
        toggleFreezeColumn,
        handleRowContextMenu,
        togglePinRow,
        handleDeleteRow,
        handleBulkDelete,
        handleCopySelection,
        setDragStartRow,
        setIsDragging
    } = useDataGridLogic(data, onCellEdit, onSelectionChange, onDeleteRow, onDeleteRows);

    // 2. Scroll State (Visual only)
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);

    // 3. Setup Resize Observer
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
        setScrollTop(scrollTop);
        if (headerRef.current) {
            headerRef.current.scrollLeft = scrollLeft;
        }
    };

    // 5. Measure Column Widths (Auto + Resizing)
    const [colWidths, setColWidths] = useState({});
    const resizingRef = useRef(null);

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

    const handleResizeMove = (e) => {
        if (!resizingRef.current) return;
        const { colName, startX, startWidth } = resizingRef.current;
        const diff = e.clientX - startX;
        const newWidth = Math.max(50, startWidth + diff);

        setColWidths(prev => ({
            ...prev,
            [colName]: newWidth
        }));
    };

    const handleResizeEnd = () => {
        resizingRef.current = null;
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
        document.body.style.cursor = 'default';
    };

    const resetLayout = () => setColWidths({});

    useEffect(() => {
        if (!data || data.length === 0 || !columns) return;
        const newWidths = {};
        const MAX_WIDTH = 400;
        const MIN_WIDTH = 100;
        const CHAR_WIDTH = 9;

        const sampleSize = Math.min(data.length, 50);
        const sampleData = data.slice(0, sampleSize);

        columns.forEach(col => {
            let maxLen = col.length;
            sampleData.forEach(row => {
                const val = row[col];
                if (val) {
                    const strLen = String(val).length;
                    if (strLen > maxLen) maxLen = strLen;
                }
            });
            let calculated = (maxLen * CHAR_WIDTH) + 30;
            calculated = Math.max(MIN_WIDTH, Math.min(calculated, MAX_WIDTH));
            newWidths[col] = calculated;
        });
        setColWidths(newWidths);
    }, [data, columns]);


    // 6. Calculate Layout
    const columnLayout = useMemo(() => {
        if (!data || data.length === 0) return { columns: [], totalWidth: 0 };

        const rowNumWidth = 60;
        const rowNumCol = {
            name: '#',
            width: rowNumWidth,
            offset: 0,
            isRowNumber: true
        };

        let currentOffset = rowNumWidth;
        const visibleColumns = columns.filter(col => !hiddenColumns.has(col));

        const mapLayout = visibleColumns.map(col => {
            const customWidth = colWidths[col];
            const width = customWidth || 150;
            const colDef = {
                name: col,
                width: width,
                offset: currentOffset
            };
            currentOffset += width;
            return colDef;
        });

        const layout = [rowNumCol, ...mapLayout];
        return { columns: layout, totalWidth: currentOffset };
    }, [columns, colWidths, data, hiddenColumns]);

    if (!columns || columns.length === 0) {
        return <div className="p-10 text-center text-gray-500">No data loaded</div>;
    }

    const { columns: colDefs, totalWidth } = columnLayout;

    // 7. Calculate Virtualization
    const totalHeight = data.length * ROW_HEIGHT;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(
        data.length,
        Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN
    );

    const visibleRows = [];
    for (let i = startIndex; i < endIndex; i++) {
        visibleRows.push({ index: i, data: data[i], top: i * ROW_HEIGHT });
    }

    const pinnedRowsArray = Array.from(pinnedRows).sort((a, b) => a - b).map(idx => ({
        index: idx,
        data: data[idx]
    }));

    const renderRow = (row, isPinned = false) => {
        const isSelected = selectedRows.has(row.index);
        const isEven = row.index % 2 === 0;
        const bg = isEven ? '#ffffff' : '#fcfcfc';

        return (
            <div
                key={isPinned ? `pinned-${row.index}` : row.index}
                onContextMenu={(e) => handleRowContextMenu(e, row.index)}
                onMouseEnter={() => handleRowMouseEnter(row.index)}
                style={{
                    position: isPinned ? 'relative' : 'absolute',
                    top: isPinned ? 'auto' : row.top,
                    left: 0,
                    width: '100%',
                    height: ROW_HEIGHT,
                    display: 'flex',
                    borderBottom: '1px solid #f0f0f0',
                    background: isSelected ? '#e3f2fd' : (isPinned ? '#fcfcfc' : bg),
                    alignItems: 'center',
                    boxSizing: 'border-box',
                }}
                className="grid-row"
            >
                {colDefs.map((col, colIndex) => {
                    // Frozen Logic
                    const isFrozen = frozenColumns.has(col.name);
                    // Simple logic: if row number (index 0) OR explicit frozen set
                    // We assume user freezes from left. 
                    // Row Number is always sticky? Yes usually.
                    const isRowNumber = col.isRowNumber;
                    const shouldSticky = isRowNumber || isFrozen;

                    // Left offset: 
                    // If row number: 0
                    // If first frozen data col: 60 (width of row num)
                    // If multiple... simplistic assumption: stack at 60 for now to avoid complexity without order tracking
                    // Ideally we use col.offset from layout if it reflects frozen state, but standard layout is flow.
                    // Let's use simplified stack: 
                    const stickyLeft = isRowNumber ? 0 : 60;

                    if (isRowNumber) {
                        return (
                            <div
                                key={col.name}
                                onMouseDown={(e) => handleRowMouseDown(row.index)}
                                onClick={(e) => handleRowClick(row.index, e.shiftKey)}
                                style={{
                                    width: col.width,
                                    minWidth: col.width,
                                    height: '100%',
                                    padding: '0 12px',
                                    borderRight: '1px solid #dcdcdc',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: '#f8f9fa',
                                    zIndex: isPinned ? 6 : 3, // Higher z-index for row num
                                    position: 'sticky',
                                    left: 0,
                                    fontFamily: 'inherit',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    color: '#6c757d',
                                    userSelect: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                {isPinned ? '🔒' : ''} {row.index + 1}
                            </div>
                        );
                    }

                    const rawValue = row.data[col.name];
                    const isMissing = rawValue === undefined || rawValue === null || rawValue === '';
                    const isEditing = !isPinned && editingCell?.rowIndex === row.index && editingCell?.colName === col.name;

                    return (
                        <div
                            key={col.name}
                            onDoubleClick={() => !isPinned && handleCellDoubleClick(row.index, col.name, rawValue || '')}
                            style={{
                                width: col.width,
                                minWidth: col.width,
                                padding: '0 12px',
                                fontSize: '13px',
                                color: isMissing ? '#d32f2f' : '#212b36',
                                fontWeight: isMissing ? '600' : '400',
                                fontStyle: isMissing ? 'italic' : 'normal',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                borderRight: '1px solid transparent',
                                cursor: 'text',
                                position: shouldSticky ? 'sticky' : 'relative',
                                left: shouldSticky ? stickyLeft : 'auto',
                                zIndex: shouldSticky ? (isPinned ? 5 : 2) : 'auto',
                                background: shouldSticky ? (isSelected ? '#e3f2fd' : (isPinned ? '#fcfcfc' : bg)) : 'transparent'
                            }}
                            title={!isMissing ? String(rawValue) : 'Missing Data'}
                        >
                            {isEditing ? (
                                <input
                                    ref={editInputRef}
                                    type="text"
                                    value={editingCell.value}
                                    onChange={(e) => handleEditChange(e, col.name)}
                                    onBlur={saveEdit}
                                    onKeyDown={handleEditKeyDown}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        border: '2px solid #0052cc',
                                        outline: 'none',
                                        padding: '0 8px',
                                        background: '#fff',
                                        fontSize: '13px',
                                        fontFamily: 'inherit'
                                    }}
                                />
                            ) : (
                                isMissing ? 'NA' : String(rawValue)
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const hasCustomLayout = Object.keys(colWidths).length > 0;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>

            {/* Context Menu (Header) */}
            {contextMenu && (
                <div
                    style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        background: '#ffffff',
                        border: '1px solid #c4cdd5',
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        zIndex: 1000,
                        minWidth: '150px'
                    }}
                >
                    <div
                        onClick={toggleFreezeColumn}
                        style={{
                            padding: '8px 16px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: '#212b36',
                            borderBottom: '1px solid #f0f0f0'
                        }}
                    >
                        {frozenColumns.has(contextMenu.column) ? '🔓 Unfreeze Column' : '❄️ Freeze Column'}
                    </div>
                    <div
                        onClick={hideColumn}
                        style={{
                            padding: '8px 16px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: '#212b36',
                            borderBottom: '1px solid #f0f0f0'
                        }}
                    >
                        🙈 Hide Column
                    </div>
                    <div
                        onClick={() => setHiddenColumns(new Set())}
                        style={{
                            padding: '8px 16px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: '#212b36'
                        }}
                    >
                        👁️ Show All Columns
                    </div>
                </div>
            )}

            {/* RESET BUTTON LAYOVER */}
            {hasCustomLayout && (
                <div style={{
                    position: 'absolute',
                    top: 10,
                    right: 20,
                    zIndex: 200
                }}>
                    <button
                        onClick={resetLayout}
                        style={{
                            background: '#ff5722',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}
                    >
                        Reset Layout
                    </button>
                </div>
            )}

            {/* Row Context Menu */}
            {rowContextMenu && (
                <div
                    style={{
                        position: 'fixed',
                        top: rowContextMenu.y,
                        left: rowContextMenu.x,
                        background: '#ffffff',
                        border: '1px solid #c4cdd5',
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        zIndex: 1000,
                        minWidth: '150px'
                    }}
                >
                    {selectedRows.size > 1 && selectedRows.has(rowContextMenu.rowIndex) ? (
                        <>
                            <div
                                onClick={() => handleCopySelection(columns)}
                                style={{ padding: '8px 16px', cursor: 'pointer', fontSize: '13px', color: '#212b36', borderBottom: '1px solid #f0f0f0' }}
                            >
                                📋 Copy {selectedRows.size} Rows
                            </div>
                            <div
                                onClick={handleBulkDelete}
                                style={{ padding: '8px 16px', cursor: 'pointer', fontSize: '13px', color: '#d32f2f' }}
                            >
                                🗑️ Delete {selectedRows.size} Rows
                            </div>
                        </>
                    ) : (
                        <>
                            <div
                                onClick={togglePinRow}
                                style={{ padding: '8px 16px', cursor: 'pointer', fontSize: '13px', color: '#212b36', borderBottom: '1px solid #f0f0f0' }}
                            >
                                {pinnedRows.has(rowContextMenu.rowIndex) ? '🔓 Unlock Row' : '🔒 Lock Row (Top)'}
                            </div>
                            <div
                                onClick={handleDeleteRow}
                                style={{ padding: '8px 16px', cursor: 'pointer', fontSize: '13px', color: '#d32f2f' }}
                            >
                                🗑️ Delete Row
                            </div>
                        </>
                    )}
                </div>
            )}


            {/* Header (Separate div, NOW ON TOP) */}
            <div
                ref={headerRef}
                style={{
                    height: ROW_HEIGHT,
                    background: '#f4f6f8',
                    borderBottom: '1px solid #dfe3e8',
                    overflow: 'hidden',
                    flexShrink: 0,
                    position: 'relative',
                    zIndex: 10
                }}
            >
                <div style={{ display: 'flex', width: totalWidth }}>
                    {colDefs.map((col, colIndex) => {
                        // Frozen Logic
                        const isFrozen = frozenColumns.has(col.name);
                        const isRowNumber = col.isRowNumber;
                        const shouldSticky = isRowNumber || isFrozen;
                        const stickyLeft = isRowNumber ? 0 : 60;

                        return (
                            <div
                                key={col.name}
                                onContextMenu={!col.isRowNumber ? (e) => handleHeaderRightClick(e, col.name) : undefined}
                                style={{
                                    width: col.width,
                                    minWidth: col.width,
                                    height: '100%',
                                    padding: '0 12px',
                                    borderRight: '1px solid #dfe3e8',
                                    fontWeight: '600',
                                    color: '#454f5b',
                                    fontSize: '13px',
                                    textTransform: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    boxSizing: 'border-box',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    position: shouldSticky ? 'sticky' : 'relative',
                                    left: shouldSticky ? stickyLeft : 'auto',
                                    zIndex: shouldSticky ? 4 : 'auto', // RowNum is usually sticky. 4 to be above normal cells but below active menus? 
                                    background: '#f4f6f8',
                                    userSelect: 'none'
                                }}
                                title={col.name}
                            >
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {col.name}
                                </span>

                                {/* DRAG HANDLE */}
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
                        );
                    })}</div>
            </div>

            {/* PINNED ROWS SECTION */}
            {pinnedRowsArray.length > 0 && (
                <div style={{
                    maxHeight: '150px',
                    overflowY: 'auto',
                    borderBottom: '2px solid #0052cc',
                    flexShrink: 0,
                    position: 'relative',
                    background: '#fff',
                    zIndex: 20
                }}>
                    {pinnedRowsArray.map(row => renderRow(row, true))}
                </div>
            )}

            {/* VIRTUAL BODY */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                style={{
                    flex: 1,
                    overflow: 'auto',
                    position: 'relative',
                    willChange: 'transform' // GPU hint
                }}
            >
                <div style={{ height: totalHeight, position: 'relative' }}>
                    {visibleRows.map(row => renderRow(row, false))}
                </div>
            </div>

        </div>
    );
}
