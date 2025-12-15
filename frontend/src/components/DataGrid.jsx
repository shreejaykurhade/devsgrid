import React, { useRef, useEffect, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import useDataGridLogic from '../hooks/useDataGridLogic';

const ROW_HEIGHT = 45;
const OVERSCAN = 5;

const DataGrid = forwardRef(({ data, columns, onCellEdit, onSelectionChange, onDeleteRow, onDeleteRows }, ref) => {
    const containerRef = useRef(null);
    const headerRef = useRef(null);

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
        cancelEdit,
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

    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            for (let entry of entries) setContainerHeight(entry.contentRect.height);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const handleScroll = (e) => {
        const { scrollTop, scrollLeft } = e.target;
        setScrollTop(scrollTop);
        if (headerRef.current) headerRef.current.scrollLeft = scrollLeft;
    };

    const [colWidths, setColWidths] = useState({});
    const resizingRef = useRef(null);

    const handleResizeStart = (e, colName, currentWidth) => {
        e.preventDefault(); e.stopPropagation();
        resizingRef.current = { colName, startX: e.clientX, startWidth: currentWidth };
        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
        document.body.style.cursor = 'col-resize';
    };

    const handleResizeMove = (e) => {
        if (!resizingRef.current) return;
        const diff = e.clientX - resizingRef.current.startX;
        setColWidths(prev => ({ ...prev, [resizingRef.current.colName]: Math.max(50, resizingRef.current.startWidth + diff) }));
    };

    const handleResizeEnd = () => {
        resizingRef.current = null;
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
        document.body.style.cursor = 'default';
    };

    const resetLayout = () => setColWidths({});

    // Expose resetLayout to parent via ref
    useImperativeHandle(ref, () => ({
        resetLayout
    }));

    useEffect(() => {
        if (!data || data.length === 0 || !columns) return;
        const newWidths = {};
        const sampleData = data.slice(0, 50);
        columns.forEach(col => {
            let maxLen = col.length;
            sampleData.forEach(row => { if (row[col]) { const l = String(row[col]).length; if (l > maxLen) maxLen = l; } });
            let w = (maxLen * 9) + 40;
            newWidths[col] = Math.max(100, Math.min(w, 400));
        });
        setColWidths(newWidths);
    }, [data, columns]);

    const columnLayout = useMemo(() => {
        if (!data || data.length === 0) return { columns: [], totalWidth: 0 };
        const visibleCols = columns.filter(c => !hiddenColumns.has(c));
        const frozenColsList = visibleCols.filter(c => frozenColumns.has(c));
        const unfrozenColsList = visibleCols.filter(c => !frozenColumns.has(c));

        const rowNumWidth = 60;
        const rowNumCol = { name: '#', width: rowNumWidth, offset: 0, isRowNumber: true, isSticky: true, stickyLeft: 0, zIndex: 5 };

        let currentOffset = rowNumWidth;
        let cumulativeStickyLeft = rowNumWidth;

        const mappedFrozen = frozenColsList.map(col => {
            const width = colWidths[col] || 150;
            const def = { name: col, width, offset: currentOffset, isSticky: true, stickyLeft: cumulativeStickyLeft, zIndex: 4 };
            currentOffset += width; cumulativeStickyLeft += width;
            return def;
        });

        const mappedUnfrozen = unfrozenColsList.map(col => {
            const width = colWidths[col] || 150;
            const def = { name: col, width, offset: currentOffset, isSticky: false, zIndex: 1 };
            currentOffset += width;
            return def;
        });

        return { columns: [rowNumCol, ...mappedFrozen, ...mappedUnfrozen], totalWidth: currentOffset };
    }, [columns, colWidths, data, hiddenColumns, frozenColumns]);

    const { columns: colDefs, totalWidth } = columnLayout;

    const totalHeight = data.length * ROW_HEIGHT;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(data.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);

    const visibleRows = [];
    for (let i = startIndex; i < endIndex; i++) visibleRows.push({ index: i, data: data[i], top: i * ROW_HEIGHT });

    const pinnedRowsArray = Array.from(pinnedRows).sort((a, b) => a - b).map(idx => ({ index: idx, data: data[idx] }));

    // --- RENDER ROW ---
    const renderRow = (row, isPinned = false) => {
        const isSelected = selectedRows.has(row.index);
        const isEven = row.index % 2 === 0;
        const bg = isEven ? '#ffffff' : '#fcfcfc';

        return (
            <div
                key={isPinned ? `pinned-${row.index}` : row.index}
                onContextMenu={(e) => handleRowContextMenu(e, row.index)}
                // SELECTION HANDLERS MOVED HERE (Whole Row)
                onMouseDown={(e) => {
                    if (e.button !== 0) return; // Only left click
                    // Don't trigger start drag if clicking input
                    if (e.target.tagName === 'INPUT') return;
                    handleRowMouseDown(e, row.index);
                }}
                onClick={(e) => {
                    // Check if input again just in case (though propagation might be stopped)
                    if (e.target.tagName === 'INPUT') return;
                    handleRowClick(e, row.index);
                }}
                onMouseEnter={() => handleRowMouseEnter(row.index)}
                style={{
                    position: isPinned ? 'relative' : 'absolute',
                    top: isPinned ? 'auto' : row.top,
                    left: 0,
                    width: totalWidth, // Ensure background covers full scroll width
                    minWidth: '100%',  // Ensure it at least fills container
                    height: ROW_HEIGHT,
                    display: 'flex',
                    borderBottom: '1px solid #f0f0f0',
                    background: isSelected ? '#e3f2fd' : (isPinned ? '#fcfcfc' : bg),
                    alignItems: 'center',
                    boxSizing: 'border-box',
                }}
            >
                {colDefs.map((col) => {
                    const { isRowNumber, isSticky, stickyLeft, zIndex } = col;

                    if (isRowNumber) {
                        return (
                            <div
                                key={col.name}
                                style={{
                                    width: col.width,
                                    minWidth: col.width,
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: '#f8f9fa',
                                    borderRight: '1px solid #dcdcdc',
                                    position: 'sticky',
                                    left: 0,
                                    zIndex: isPinned ? 10 : 5,
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    color: '#6c757d',
                                    fontSize: '12px',
                                    fontWeight: '600'
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
                            onDoubleClick={(e) => {
                                e.stopPropagation(); // Prevent selection toggle when dbl clicking?
                                !isPinned && handleCellDoubleClick(row.index, col.name, rawValue || '');
                            }}
                            style={{
                                width: col.width,
                                minWidth: col.width,
                                height: '100%',
                                padding: '0 12px',
                                borderRight: '1px solid transparent',
                                display: 'flex',
                                alignItems: 'center',
                                position: isSticky ? 'sticky' : 'relative',
                                left: isSticky ? stickyLeft : 'auto',
                                zIndex: isPinned ? (zIndex + 5) : zIndex,
                                background: isSticky ? (isSelected ? '#e3f2fd' : (isPinned ? '#fcfcfc' : bg)) : 'transparent',
                                fontSize: '13px',
                                color: isMissing ? '#d32f2f' : '#212b36',
                                fontWeight: isMissing ? '600' : '400',
                                fontStyle: isMissing ? 'italic' : 'normal',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                cursor: 'text'
                            }}
                            title={!isMissing ? String(rawValue) : 'Missing Data'}
                        >
                            {isEditing ? (
                                <input
                                    ref={editInputRef}
                                    type="text"
                                    value={editingCell.value}
                                    onChange={(e) => handleEditChange(e, col.name)}
                                    // Stop propagation to prevent row click
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onBlur={saveEdit}
                                    onKeyDown={handleEditKeyDown}
                                    style={{
                                        width: '100%', height: '100%',
                                        border: '2px solid #0052cc', outline: 'none',
                                        padding: '0 8px', background: '#fff', fontSize: '13px', fontFamily: 'inherit'
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

    if (!columns || columns.length === 0) return <div className="p-10 text-center text-gray-500">No data loaded</div>;
    const hasCustomLayout = Object.keys(colWidths).length > 0;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>

            {/* Header */}
            <div
                ref={headerRef}
                style={{
                    height: ROW_HEIGHT,
                    background: '#f4f6f8',
                    borderBottom: '1px solid #dfe3e8',
                    overflow: 'hidden',
                    flexShrink: 0,
                    position: 'relative',
                    zIndex: 20
                }}
            >
                <div style={{ display: 'flex', width: totalWidth }}>
                    {colDefs.map((col) => {
                        const isFrozen = frozenColumns.has(col.name) && !col.isRowNumber;
                        return (
                            <div
                                key={col.name}
                                onContextMenu={(e) => {
                                    // Make entire header cell right-clickable (not just text)
                                    if (!col.isRowNumber) {
                                        handleHeaderRightClick(e, col.name);
                                    }
                                }}
                                style={{
                                    width: col.width, minWidth: col.width, height: '100%', padding: '0 12px', borderRight: '1px solid #dfe3e8',
                                    display: 'flex', alignItems: 'center', position: col.isSticky ? 'sticky' : 'relative',
                                    left: col.isSticky ? col.stickyLeft : 'auto', zIndex: col.zIndex + 10,
                                    background: '#f4f6f8', fontWeight: '600', color: '#454f5b', fontSize: '13px', userSelect: 'none',
                                    cursor: col.isRowNumber ? 'pointer' : 'context-menu'
                                }}
                            >
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {isFrozen && <span style={{ fontSize: '11px' }}>🔒</span>}
                                    {col.name}
                                </span>
                                {!col.isRowNumber && (
                                    <div
                                        onMouseDown={(e) => handleResizeStart(e, col.name, col.width)}
                                        style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '8px', cursor: 'col-resize', zIndex: 10 }}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Main Body */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                style={{
                    flex: 1,
                    // Force horizontal scrollbar to ALWAYS be visible ('scroll')
                    // Vertical can be auto
                    overflowX: 'scroll',
                    overflowY: 'auto',
                    position: 'relative',
                    willChange: 'transform'
                }}
            >
                {/* Sticky Pinned Rows */}
                {pinnedRowsArray.length > 0 && (
                    <div style={{ position: 'sticky', top: 0, zIndex: 15, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                        {pinnedRowsArray.map(row => renderRow(row, true))}
                    </div>
                )}
                {/* Virtual Rows */}
                <div style={{ height: totalHeight, position: 'relative' }}>
                    {visibleRows.map(row => renderRow(row, false))}
                </div>
            </div>

            {/* Menus */}
            {contextMenu && (
                <div style={{
                    position: 'fixed', top: contextMenu.y, left: contextMenu.x,
                    background: '#fff', border: '1px solid #c4cdd5', borderRadius: '4px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 9999, minWidth: '150px'
                }}>
                    <div onClick={toggleFreezeColumn} className="ctx-item" style={{ padding: '8px 16px', cursor: 'pointer', borderBottom: '1px solid #eee' }}>
                        {frozenColumns.has(contextMenu.column) ? '🔓 Unfreeze' : '❄️ Freeze'}
                    </div>
                    <div onClick={hideColumn} className="ctx-item" style={{ padding: '8px 16px', cursor: 'pointer', borderBottom: '1px solid #eee' }}>🙈 Hide</div>
                    <div onClick={() => setHiddenColumns(new Set())} className="ctx-item" style={{ padding: '8px 16px', cursor: 'pointer' }}>👁️ Show All</div>
                </div>
            )}

            {rowContextMenu && (
                <div style={{
                    position: 'fixed', top: rowContextMenu.y, left: rowContextMenu.x,
                    background: '#fff', border: '1px solid #c4cdd5', borderRadius: '4px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 9999, minWidth: '150px'
                }}>
                    <div style={{ padding: '8px 16px', background: '#f4f6f8', borderBottom: '1px solid #eee', fontSize: '11px', color: '#666', fontWeight: 600 }}>
                        ROW: {rowContextMenu.rowIndex + 1}
                    </div>
                    {selectedRows.size > 1 && selectedRows.has(rowContextMenu.rowIndex) ? (
                        <>
                            <div onClick={() => handleCopySelection(columns)} style={{ padding: '8px 16px', cursor: 'pointer', borderBottom: '1px solid #eee' }}>📋 Copy {selectedRows.size} Rows</div>
                            <div onClick={handleBulkDelete} style={{ padding: '8px 16px', cursor: 'pointer', color: 'red' }}>🗑️ Delete {selectedRows.size} Rows</div>
                        </>
                    ) : (
                        <>
                            <div onClick={togglePinRow} style={{ padding: '8px 16px', cursor: 'pointer', borderBottom: '1px solid #eee' }}>
                                {pinnedRows.has(rowContextMenu.rowIndex) ? '🔓 Unlock Row' : '🔒 Lock Row (Top)'}
                            </div>
                            <div onClick={handleDeleteRow} style={{ padding: '8px 16px', cursor: 'pointer', color: 'red' }}>🗑️ Delete Row</div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
});

export default DataGrid;
