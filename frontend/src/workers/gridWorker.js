/* eslint-disable no-restricted-globals */
import * as XLSX from 'xlsx';
import { executeCommand } from '../engine/commandEngine';

// State in Worker
// masterData: The source of truth containing ALL rows with unique IDs.
// currentData: The currently visible/filtered/sorted subset of masterData.
// We must ensure that objects in currentData are REFERENCES to objects in masterData.
let masterData = [];
let currentData = [];

// History System
let history = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

function pushHistory(action) {
    history = history.slice(0, historyIndex + 1);
    history.push(action);
    if (history.length > MAX_HISTORY) {
        history.shift();
    } else {
        historyIndex++;
    }
    notifyHistoryState();
}

function notifyHistoryState() {
    self.postMessage({
        type: 'HISTORY_STATE',
        payload: { canUndo: historyIndex >= 0, canRedo: historyIndex < history.length - 1 }
    });
}

// Helper to ensure every row has a unique ID
function ensureIds(rows) {
    return rows.map((row, idx) => {
        if (!row._id) {
            // Use timestamp + random + index to ensure uniqueness even across sessions/merges
            return { ...row, _id: `row_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}` };
        }
        return row;
    });
}

self.onmessage = (e) => {
    const { type, payload } = e.data;

    try {
        if (type === 'LOAD_FILE') {
            const { buffer, fileName } = payload;
            let rows = [];

            if (fileName.endsWith('.json')) {
                const decoder = new TextDecoder("utf-8");
                const jsonText = decoder.decode(buffer);
                const json = JSON.parse(jsonText);
                rows = Array.isArray(json) ? json : (json.data || []);
            } else {
                const wb = XLSX.read(buffer, { type: 'array' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                rows = XLSX.utils.sheet_to_json(ws, { defval: "NA" });
            }

            // Initialize masterData with IDs
            masterData = ensureIds(rows);
            // currentData is initially a reference to the same arrays (shallow copy of list, shared objects)
            // But to allow sorting/filtering currentData without messing up masterData order, we behave as follows:
            // currentData holds REFERENCES to the objects in masterData.
            currentData = [...masterData];

            console.log('FILE LOADED:', masterData.length, 'rows');
            self.postMessage({ type: 'DATA_LOADED', payload: currentData });
            // Initial save to ensure IDs are persisted
            self.postMessage({ type: 'SESSION_SAVE_NEEDED' });
        }

        if (type === 'LOAD_EXISTING_DATA') {
            // payload is the rows from IndexedDB (the last saved state)
            let loadedRows = payload;

            // If loadedRows have IDs, great. If not, assign them.
            // If we are restoring a session, this IS the masterData content.
            masterData = ensureIds(loadedRows);
            currentData = [...masterData];

            self.postMessage({ type: 'DATA_LOADED', payload: currentData });
        }

        if (type === 'RUN_COMMAND') {
            console.log('COMMAND:', payload);

            if (payload.startsWith('EXPORT ')) {
                const format = payload.split(' ')[1]?.toLowerCase();
                if (!format) return;

                // Export currentData (what user sees) or masterData? Usually what user sees.
                const dataToExport = currentData.map(({ _id, ...rest }) => rest); // Exclude ID for export

                let content = '';
                let mimeType = 'text/plain';

                if (format === 'json') {
                    content = JSON.stringify(dataToExport, null, 2);
                    mimeType = 'application/json';
                } else if (format === 'csv') {
                    const ws = XLSX.utils.json_to_sheet(dataToExport);
                    content = XLSX.write({ Sheets: { data: ws }, SheetNames: ['data'] }, { bookType: 'csv', type: 'string' });
                    mimeType = 'text/csv';
                } else if (format === 'sql') {
                    const tableName = 'devsgrid_export';
                    content = dataToExport.map(row => {
                        const cols = Object.keys(row).join(', ');
                        const vals = Object.values(row).map(v => typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v).join(', ');
                        return `INSERT INTO ${tableName} (${cols}) VALUES (${vals});`;
                    }).join('\n');
                    mimeType = 'application/sql';
                } else if (format === 'md') {
                    // ... existing markdown logic ...
                    if (dataToExport.length > 0) {
                        const cols = Object.keys(dataToExport[0]);
                        const header = `| ${cols.join(' | ')} |`;
                        const divider = `| ${cols.map(() => '---').join(' | ')} |`;
                        const rows = dataToExport.map(row => `| ${cols.map(c => row[c]).join(' | ')} |`).join('\n');
                        content = `${header}\n${divider}\n${rows}`;
                    } else {
                        content = 'No data';
                    }
                    mimeType = 'text/markdown';
                }

                self.postMessage({
                    type: 'EXPORT_READY',
                    payload: { content, format, mimeType }
                });
                return;
            }

            // Handing Filters/Sorts
            // These should operate on masterData if it's a "fresh" filter,
            // or chain on currentData?
            // Usually, "Filter" commands in this app seem to imply "Search", so maybe against currentData?
            // usage in App.jsx: handleFilterChange sends "FILTER ...".
            // If I search "A", then valid rows are shown. If I then search "B", 
            // usually it searches within results OR resets and searches?
            // Looking at `commandEngine.js`, it just filters the array passed to it.
            // If we want standard behavior:
            // - "Sort" sorts the current view.
            // - "Filter" usually reduces current view OR filters from raw.
            // Let's assume for now commands operate on `currentData` for chaining,
            // EXCEPT if it's a Reset/special case.
            // Actually, `Toolbar.jsx` implementation of "Reset" sends "RESET" command.
            // "Filters" in toolbar seem to be additive if not reset.

            // The issue with `masterData` vs `currentData` is:
            // `executeCommand` logic in `commandEngine` currently creates NEW arrays and NEW objects (in map/filter).
            // FILTER creates a shallow copy of valid items.
            // SORT creates a shallow copy.
            // MAP (Select) creates NEW objects.

            // CRUTIAL: `executeCommand` must NOT break references to `masterData` objects if we want shared state.
            // `commandEngine.js` `FILTER`: `return rows.filter(...)`. 
            // This returns a new array with REFERENCES to the original objects. -> GOOD.
            // `commandEngine.js` `SORT`: `[...rows].sort(...)`. 
            // This returns new array with REFERENCES. -> GOOD.
            // `commandEngine.js` `SELECT`: `rows.map(...)` creating newRow. -> BAD for editing. 
            // If user uses SELECT, and then edits, the edit won't propagate to masterData because the object is new.

            // For now, let's assume standard Grid operations (Sort/Filter) preserve references.
            // We just need to ensure we don't accidentally deep clone where we shouldn't.

            const isNAPresetFilter = payload.includes('= "NA"') || payload.includes('!= "NA"');
            // If it's a "global" filter logic like showing missing data, maybe valid to start from masterData?
            // The original logic swaped rawData/currentData.
            // Let's use masterData as "base" if user wants to reset scope, or currentData if chaining.
            // But typical "Search" behavior usually runs on current filters or resets? 
            // Let's stick to: commands run on currentData unless it's a clear "Reset" behavior.
            // BUT, `Toolbar` has a "Reset" button.
            // So chaining is fine.

            // However, the `isNAPresetFilter` logic suggests the user wanted to check ALL data for missing/existing, ignoring current filters?
            // Let's keep that logic for "Presets".

            const sourceData = isNAPresetFilter ? masterData : currentData;

            console.log('Using', isNAPresetFilter ? 'masterData' : 'currentData', '|', sourceData.length, 'rows');

            const result = executeCommand(payload, sourceData);

            if (Array.isArray(result)) {
                currentData = result;
                // Result contains references to masterData objects (hopefully).
                console.log('RESULT:', result.length, 'rows');
                self.postMessage({ type: 'DATA_UPDATED', payload: currentData });
            } else {
                self.postMessage({ type: 'COMMAND_RESULT', payload: result });
            }
        }

        if (type === 'RESET') {
            currentData = [...masterData]; // Reset view to all data
            console.log('RESET: Restored', masterData.length, 'rows');
            self.postMessage({ type: 'DATA_UPDATED', payload: currentData });
        }

        if (type === 'CELL_EDIT') {
            const { rowIndex, col, value } = payload;

            // rowIndex here is the index in currentData (visible rows).
            if (currentData[rowIndex]) {
                const rowObj = currentData[rowIndex];
                const oldValue = rowObj[col]; // This reads from the shared object

                // EDITING THE SHARED OBJECT DIRECTLY
                // This updates it in masterData automatically because rowObj is a reference to the object in masterData.
                rowObj[col] = value;

                // Push to history with ID for robust Undo
                pushHistory({
                    type: 'CELL_EDIT',
                    rowId: rowObj._id,
                    col,
                    oldValue,
                    newValue: value
                });

                // Trigger Save
                self.postMessage({ type: 'SESSION_SAVE_NEEDED' });
                // No need to send DATA_LOADED if we mutated in place and React might not detect deep change?
                // Actually, React usually needs a new array reference or forced update.
                // We typically send 'DATA_UPDATED' or similar to refresh UI.
                // But typically `currentData` array reference didn't change, only internal object.
                // We should probably broadcast the update.
                // Or easier:
                // self.postMessage({ type: 'DATA_UPDATED', payload: currentData }); -> might not trigger re-render if array ref effectively same?
                // Usually we just need to ensure the UI knows.
                // But wait, `currentData` variable is the same array reference in this worker scope? 
                // No, on message, we usually send the whole array. PostMessage clones it. 
                // So React receives a NEW array (clone). So re-render WILL occur. -> GOOD.

                // Note: We don't always need to resend the whole dataset for a cell edit if the UI is smart, 
                // but for this architecture, sending payload is safest to keep UI in sync.
                // However, for large datasets, sending all data on every keystroke is heavy.
                // OPTIMIZATION: The App.jsx handles generic updates. 
                // But the user complained about "saving live".
                // We will send the update.
                self.postMessage({ type: 'DATA_UPDATED', payload: currentData });
            }
        }

        if (type === 'DELETE_ROW') {
            const { rowIndex } = payload;
            if (currentData[rowIndex]) {
                const rowObj = currentData[rowIndex];
                const rowId = rowObj._id;

                // Remove from currentData
                currentData.splice(rowIndex, 1);

                // Remove from masterData
                const masterIndex = masterData.findIndex(r => r._id === rowId);
                if (masterIndex !== -1) {
                    masterData.splice(masterIndex, 1);
                }

                pushHistory({
                    type: 'DELETE_ROW',
                    rowId,
                    rowObj, // Save the whole object for restore
                    masterIndex // approximate index, might not be perfect on redo if others deleted, but ID matching is better
                });

                self.postMessage({ type: 'DATA_LOADED', payload: currentData });
                self.postMessage({ type: 'SESSION_SAVE_NEEDED' });
            }
        }

        if (type === 'DELETE_ROWS') {
            const { rowIndices } = payload;
            const sortedIndices = [...rowIndices].sort((a, b) => b - a);

            const deletedItems = [];

            sortedIndices.forEach(idx => {
                if (currentData[idx]) {
                    const rowObj = currentData[idx];
                    const rowId = rowObj._id;

                    // Remove from currentData
                    currentData.splice(idx, 1);

                    // Remove from masterData
                    const masterIndex = masterData.findIndex(r => r._id === rowId);
                    if (masterIndex !== -1) {
                        masterData.splice(masterIndex, 1);
                    }

                    deletedItems.push({ rowId, rowObj, masterIndex });
                }
            });

            if (deletedItems.length > 0) {
                pushHistory({
                    type: 'DELETE_ROWS',
                    items: deletedItems.reverse() // store in order of deletion or original order?
                });
                self.postMessage({ type: 'DATA_LOADED', payload: currentData });
                self.postMessage({ type: 'SESSION_SAVE_NEEDED' });
            }
        }


        // UNDO / REDO need to use IDs now
        if (type === 'UNDO') {
            if (historyIndex >= 0) {
                const action = history[historyIndex];

                if (action.type === 'CELL_EDIT') {
                    // Find row in masterData (and currentData) via ID
                    const row = masterData.find(r => r._id === action.rowId);
                    if (row) {
                        row[action.col] = action.oldValue;
                    }
                } else if (action.type === 'DELETE_ROW') {
                    // Restore to masterData
                    // We can check if it exists (failsafe)
                    if (!masterData.find(r => r._id === action.rowId)) {
                        // Insert back. Order? ideally at action.masterIndex but that might be shifted.
                        // Ideally just append or try to insert.
                        if (action.masterIndex !== undefined && action.masterIndex <= masterData.length) {
                            masterData.splice(action.masterIndex, 0, action.rowObj);
                        } else {
                            masterData.push(action.rowObj);
                        }
                        // Also need to decide if we add to currentData?
                        // If we are viewing filtered results, should the restored row appear?
                        // Consistent behavior: Reset view? Or try to add to view?
                        // "Smart" behavior: check if it passes current filter?
                        // Lazy behavior: Just add to currentData too for immediate feedback.
                        if (currentData !== masterData) {
                            currentData.push(action.rowObj); // Simplest, might be out of order in view
                        }
                    }
                } else if (action.type === 'DELETE_ROWS') {
                    action.items.forEach(item => {
                        if (!masterData.find(r => r._id === item.rowId)) {
                            if (item.masterIndex !== undefined && item.masterIndex <= masterData.length) {
                                masterData.splice(item.masterIndex, 0, item.rowObj);
                            } else {
                                masterData.push(item.rowObj);
                            }
                            if (currentData !== masterData) {
                                currentData.push(item.rowObj);
                            }
                        }
                    });
                }

                historyIndex--;
                self.postMessage({ type: 'DATA_LOADED', payload: currentData });
                self.postMessage({ type: 'SESSION_SAVE_NEEDED' });
                notifyHistoryState();
            }
        }

        if (type === 'REDO') {
            if (historyIndex < history.length - 1) {
                historyIndex++;
                const action = history[historyIndex];

                if (action.type === 'CELL_EDIT') {
                    const row = masterData.find(r => r._id === action.rowId);
                    if (row) {
                        row[action.col] = action.newValue;
                    }
                } else if (action.type === 'DELETE_ROW') {
                    const masterIdx = masterData.findIndex(r => r._id === action.rowId);
                    if (masterIdx !== -1) masterData.splice(masterIdx, 1);

                    const currentIdx = currentData.findIndex(r => r._id === action.rowID);
                    if (currentIdx !== -1) currentData.splice(currentIdx, 1);
                } else if (action.type === 'DELETE_ROWS') {
                    action.items.forEach(item => {
                        const masterIdx = masterData.findIndex(r => r._id === item.rowId);
                        if (masterIdx !== -1) masterData.splice(masterIdx, 1);

                        const currentIdx = currentData.findIndex(r => r._id === item.rowId);
                        if (currentIdx !== -1) currentData.splice(currentIdx, 1);
                    });
                }

                self.postMessage({ type: 'DATA_LOADED', payload: currentData });
                self.postMessage({ type: 'SESSION_SAVE_NEEDED' });
                notifyHistoryState();
            }
        }

        // When saving raw session, we usually want to save the MASTER DATA (all edits), 
        // to preserve hidden rows too.
        if (type === 'EXPORT_RAW_JSON') {
            self.postMessage({ type: 'RAW_JSON_EXPORT', payload: masterData });
        }

    } catch (error) {
        self.postMessage({ type: 'ERROR', payload: error.message });
    }
};
