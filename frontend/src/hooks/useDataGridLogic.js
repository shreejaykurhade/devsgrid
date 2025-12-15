import { useState, useRef, useEffect, useCallback } from 'react';

export default function useDataGridLogic(data, onCellEdit, onSelectionChange, onDeleteRow, onDeleteRows) {
    // --- 1. Selection State ---
    const [selectedRows, setSelectedRows] = useState(new Set());
    const lastClickedRowRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartRow, setDragStartRow] = useState(null);
    const selectionBeforeDrag = useRef(new Set());
    const didDragRef = useRef(false);

    // --- 2. Edit State ---
    const [editingCell, setEditingCell] = useState(null);
    const editInputRef = useRef(null);

    // --- 3. Visual State (Pinning & Hiding) ---
    const [pinnedRows, setPinnedRows] = useState(new Set());
    const [hiddenColumns, setHiddenColumns] = useState(new Set());
    const [frozenColumns, setFrozenColumns] = useState(new Set()); // Arbitrary frozen columns

    // --- 4. Context Menus ---
    const [contextMenu, setContextMenu] = useState(null); // { x, y, column }
    const [rowContextMenu, setRowContextMenu] = useState(null); // { x, y, rowIndex }


    // --- Selection Handlers ---
    // Hybrid Model: Exclusive Click, Additive Drag
    // 1. MouseDown: Prepare, but don't commit exclusive clear yet (wait to see if drag).
    //    BUT we need visual feedback.
    //    Compromise: 
    //    - If Ctrl/Shift: Handle immediately.
    //    - If Normal: 
    //      - If clicking unselected: Select immediately (Exclusive).
    //      - If clicking selected: Wait (might be drag start).
    //    Wait, "Select multiple bulks" -> User wants Drag to be Additive.

    const handleRowMouseDown = useCallback((e, rowIndex) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault();

        const isCtrl = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;

        didDragRef.current = false; // Reset drag flag

        // 1. Modifiers (Standard)
        if (isShift || isCtrl) {
            if (isShift && lastClickedRowRef.current !== null) {
                const start = Math.min(lastClickedRowRef.current, rowIndex);
                const end = Math.max(lastClickedRowRef.current, rowIndex);
                const newSelection = new Set(selectedRows);
                // If you want Shift to be additive range (safe):
                if (!isCtrl) newSelection.clear();
                for (let i = start; i <= end; i++) newSelection.add(i);
                setSelectedRows(newSelection);
                lastClickedRowRef.current = rowIndex; // Anchor for next shift-click
                return;
            }
            if (isCtrl) {
                const newSelection = new Set(selectedRows);
                if (newSelection.has(rowIndex)) newSelection.delete(rowIndex); // Toggle
                else newSelection.add(rowIndex);
                setSelectedRows(newSelection);
                lastClickedRowRef.current = rowIndex;

                // Drag Init for Ctrl (allows dragging the toggled selection)
                setIsDragging(true);
                setDragStartRow(rowIndex);
                selectionBeforeDrag.current = newSelection; // Snapshot the state AFTER the toggle
                return;
            }
        }

        // 2. Normal Click (No Modifiers)
        // Hybrid: Drag adds, Click replaces.

        // Always Start Drag assuming Additive from current state
        setIsDragging(true);
        setDragStartRow(rowIndex);
        selectionBeforeDrag.current = new Set(selectedRows); // Snapshot the selection BEFORE this click potentially changes it
        lastClickedRowRef.current = rowIndex;

        // Visual handling for immediate feedback:
        // If the clicked row is not already selected, select it exclusively for immediate feedback.
        // If it is selected, keep the current selection (to allow dragging the group).
        // The final exclusive selection for a non-drag click will be handled in handleRowClick.
        if (!selectedRows.has(rowIndex)) {
            setSelectedRows(new Set([rowIndex]));
        }

    }, [selectedRows]);

    // Handle Row Click (MouseUp logic effectively)
    const handleRowClick = useCallback((e, rowIndex) => {
        // This fires after MouseDown and potential MouseEnter (drag).
        // If a drag occurred, didDragRef.current would be true, and selection is already handled by MouseEnter.
        // If no drag occurred (it was just a click), then we enforce exclusive selection.
        if (!didDragRef.current) {
            const isCtrl = e.ctrlKey || e.metaKey;
            const isShift = e.shiftKey;

            // If modifiers were used, selection was already handled in MouseDown.
            if (isCtrl || isShift) {
                return;
            }

            // Normal click without drag: Exclusive selection
            setSelectedRows(new Set([rowIndex]));
        }
        // Reset drag state if it was a click (not a drag)
        setIsDragging(false);
        setDragStartRow(null);
    }, []);

    const handleRowMouseEnter = useCallback((rowIndex) => {
        if (isDragging && dragStartRow !== null) {
            // If we enter a new row while dragging, it's a drag!
            if (rowIndex !== dragStartRow) {
                didDragRef.current = true;
            }
            const start = Math.min(dragStartRow, rowIndex);
            const end = Math.max(dragStartRow, rowIndex);

            // Standard Drag: "Paint" the selection?
            // Or "Range" from Start?
            // Excel: Dragging extends selection from Anchor.

            const newSelection = new Set(selectionBeforeDrag.current);
            // Add range
            for (let i = start; i <= end; i++) {
                newSelection.add(i);
            }
            setSelectedRows(newSelection);
        }
    }, [isDragging, dragStartRow]);

    useEffect(() => {
        const handleMouseUp = () => {
            if (isDragging) {
                setIsDragging(false);
                setDragStartRow(null);
            }
        };
        document.addEventListener('mouseup', handleMouseUp);
        return () => document.removeEventListener('mouseup', handleMouseUp);
    }, [isDragging]);

    useEffect(() => {
        if (!onSelectionChange) return;
        if (selectedRows.size === 0) {
            onSelectionChange({ count: 0 });
            return;
        }

        const numericValues = [];
        let textCells = 0;
        let emptyCells = 0;
        let totalCells = 0;

        selectedRows.forEach(rowIndex => {
            if (data[rowIndex]) {
                Object.values(data[rowIndex]).forEach(val => {
                    totalCells++;

                    if (val === null || val === undefined || val === '' || val === 'NA') {
                        emptyCells++;
                    } else if (typeof val === 'number') {
                        numericValues.push(val);
                    } else if (typeof val === 'string' && !isNaN(Number(val)) && val !== '') {
                        numericValues.push(Number(val));
                    } else {
                        textCells++;
                    }
                });
            }
        });

        const stats = {
            rows: selectedRows.size,
            cells: totalCells,
            numericCells: numericValues.length,
            textCells,
            emptyCells
        };

        if (numericValues.length > 0) {
            stats.min = Math.min(...numericValues);
            stats.max = Math.max(...numericValues);
            stats.avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
        }

        onSelectionChange(stats);
    }, [selectedRows, data, onSelectionChange]);


    // --- Edit Handlers ---
    const getColumnDataType = useCallback((colName) => {
        if (!data || data.length === 0) return 'text';
        const samples = data.slice(0, 50).map(row => row[colName]).filter(v => v !== null && v !== undefined && v !== '' && v !== 'NA');
        if (samples.length === 0) return 'text';
        return samples.every(v => typeof v === 'number' || (!isNaN(Number(v)) && v !== '')) ? 'number' : 'text';
    }, [data]);

    const handleCellDoubleClick = useCallback((rowIndex, colName, currentValue) => {
        setEditingCell({ rowIndex, colName, value: currentValue });
    }, []);

    const saveEdit = useCallback(() => {
        if (!editingCell || !onCellEdit) return;
        onCellEdit(editingCell.rowIndex, editingCell.colName, editingCell.value);
        setEditingCell(null);
    }, [editingCell, onCellEdit]);

    const cancelEdit = useCallback(() => {
        setEditingCell(null);
    }, []);

    const handleEditChange = useCallback((e, colName) => {
        const newValue = e.target.value;
        const dataType = getColumnDataType(colName);
        if (dataType === 'number') {
            if (newValue === '' || newValue === '-' || !isNaN(Number(newValue))) {
                setEditingCell(prev => ({ ...prev, value: newValue }));
            }
        } else {
            setEditingCell(prev => ({ ...prev, value: newValue }));
        }
    }, [getColumnDataType]);

    const handleEditKeyDown = useCallback((e) => {
        if (e.key === 'Enter') saveEdit();
        else if (e.key === 'Escape') cancelEdit();
    }, [saveEdit, cancelEdit]);

    // Focus input
    useEffect(() => {
        if (editingCell && editInputRef.current) {
            editInputRef.current.focus();
            // editInputRef.current.select(); // Removed auto-select to prevent interference while typing
        }
    }, [editingCell?.rowIndex, editingCell?.colName]); // Only run when active cell *changes*

    // ESCAPE to Deselect
    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            if (e.key === 'Escape' && !editingCell) {
                setSelectedRows(new Set());
            }
        };
        document.addEventListener('keydown', handleGlobalKeyDown);
        return () => document.removeEventListener('keydown', handleGlobalKeyDown);
    }, [editingCell]);


    // --- Context Menu Handlers (Refined for Frozen Cols) ---
    const handleHeaderRightClick = useCallback((e, colName) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, column: colName });
    }, []);

    const hideColumn = useCallback(() => {
        if (contextMenu) {
            setHiddenColumns(prev => new Set([...prev, contextMenu.column]));
            setContextMenu(null);
        }
    }, [contextMenu]);

    const toggleFreezeColumn = useCallback(() => {
        if (contextMenu) {
            const col = contextMenu.column;
            setFrozenColumns(prev => {
                const newSet = new Set(prev);
                if (newSet.has(col)) newSet.delete(col);
                else newSet.add(col);
                return newSet;
            });
            setContextMenu(null);
        }
    }, [contextMenu]);

    const handleRowContextMenu = useCallback((e, rowIndex) => {
        e.preventDefault();
        setRowContextMenu({ x: e.clientX, y: e.clientY, rowIndex });
    }, []);

    const togglePinRow = useCallback(() => {
        if (!rowContextMenu) return;
        const targetIndex = rowContextMenu.rowIndex;

        setPinnedRows(prev => {
            const newPinned = new Set(prev);
            const isTargetSelected = selectedRows.has(targetIndex);

            // If target is part of selection, toggle ALL selected rows based on target's new state
            // If target is NOT selected, only toggle target
            const rowsToToggle = isTargetSelected ? Array.from(selectedRows) : [targetIndex];

            const shouldPin = !newPinned.has(targetIndex); // Toggle based on clicked row

            rowsToToggle.forEach(idx => {
                if (shouldPin) newPinned.add(idx);
                else newPinned.delete(idx);
            });

            return newPinned;
        });
        setRowContextMenu(null);
    }, [rowContextMenu, selectedRows]);

    const handleDeleteRow = useCallback(() => {
        if (!rowContextMenu) return;
        if (onDeleteRow) onDeleteRow(rowContextMenu.rowIndex);
        setRowContextMenu(null);
    }, [rowContextMenu, onDeleteRow]);

    const handleBulkDelete = useCallback(() => {
        if (!onDeleteRows || selectedRows.size === 0) return;
        onDeleteRows(Array.from(selectedRows));
        setSelectedRows(new Set());
        setRowContextMenu(null);
    }, [onDeleteRows, selectedRows]);

    const handleCopySelection = useCallback((columns) => {
        if (selectedRows.size === 0) return;
        const indices = Array.from(selectedRows).sort((a, b) => a - b);
        const visibleCols = columns.filter(c => !hiddenColumns.has(c));
        const header = visibleCols.join('\t');
        const rows = indices.map(idx => {
            const rowData = data[idx];
            if (!rowData) return '';
            return visibleCols.map(col => {
                const val = rowData[col];
                return val === null || val === undefined ? '' : String(val);
            }).join('\t');
        }).join('\n');

        const clipboardText = `${header}\n${rows}`;
        navigator.clipboard.writeText(clipboardText);
        setRowContextMenu(null);
    }, [selectedRows, data, hiddenColumns]);

    // Close menus
    useEffect(() => {
        const closeMenus = () => {
            setContextMenu(null);
            setRowContextMenu(null);
        };
        document.addEventListener('click', closeMenus);
        return () => document.removeEventListener('click', closeMenus);
    }, []);


    return {
        // State
        selectedRows,
        editingCell,
        pinnedRows,
        hiddenColumns,
        frozenColumns,
        contextMenu,
        rowContextMenu,
        editInputRef,
        isDragging,

        // Setters
        setHiddenColumns,
        setPinnedRows,
        setContextMenu,
        setRowContextMenu,
        setFrozenColumns,
        setSelectedRows,

        // Handlers
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

        setIsDragging,
        setDragStartRow
    };
}
