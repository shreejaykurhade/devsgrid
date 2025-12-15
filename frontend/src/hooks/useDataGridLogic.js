import { useState, useRef, useEffect, useCallback } from 'react';

export default function useDataGridLogic(data, onCellEdit, onSelectionChange, onDeleteRow, onDeleteRows) {
    // --- 1. Selection State ---
    const [selectedRows, setSelectedRows] = useState(new Set());
    const lastClickedRowRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartRow, setDragStartRow] = useState(null);
    const selectionBeforeDrag = useRef(new Set());

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
    const handleRowClick = useCallback((rowIndex, isShiftClick) => {
        if (isDragging) return;

        if (isShiftClick && lastClickedRowRef.current !== null) {
            const start = Math.min(lastClickedRowRef.current, rowIndex);
            const end = Math.max(lastClickedRowRef.current, rowIndex);
            const newSelection = new Set(selectedRows);
            for (let i = start; i <= end; i++) newSelection.add(i);
            setSelectedRows(newSelection);
        } else {
            const newSelection = new Set(selectedRows);
            if (newSelection.has(rowIndex)) newSelection.delete(rowIndex);
            else newSelection.add(rowIndex);
            setSelectedRows(newSelection);
            lastClickedRowRef.current = rowIndex;
        }
    }, [isDragging, selectedRows]);

    const handleRowMouseDown = useCallback((rowIndex) => {
        setIsDragging(true);
        setDragStartRow(rowIndex);
        selectionBeforeDrag.current = new Set(selectedRows);
        const newSelection = new Set(selectedRows);
        newSelection.add(rowIndex);
        setSelectedRows(newSelection);
        lastClickedRowRef.current = rowIndex;
    }, [selectedRows]);

    const handleRowMouseEnter = useCallback((rowIndex) => {
        if (isDragging && dragStartRow !== null) {
            const start = Math.min(dragStartRow, rowIndex);
            const end = Math.max(dragStartRow, rowIndex);
            const newSelection = new Set(selectionBeforeDrag.current);
            for (let i = start; i <= end; i++) newSelection.add(i);
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
        selectedRows.forEach(rowIndex => {
            if (data[rowIndex]) {
                Object.values(data[rowIndex]).forEach(val => {
                    if (typeof val === 'number') numericValues.push(val);
                    else if (typeof val === 'string' && !isNaN(Number(val)) && val !== '') numericValues.push(Number(val));
                });
            }
        });
        const count = selectedRows.size;
        let stats = { count };
        if (numericValues.length > 0) {
            const sum = numericValues.reduce((a, b) => a + b, 0);
            stats.sum = sum;
            stats.avg = sum / numericValues.length;
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
        const rowIndex = rowContextMenu.rowIndex;
        setPinnedRows(prev => {
            const newPinned = new Set(prev);
            if (newPinned.has(rowIndex)) newPinned.delete(rowIndex);
            else newPinned.add(rowIndex);
            return newPinned;
        });
        setRowContextMenu(null);
    }, [rowContextMenu]);

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
