/* eslint-disable no-restricted-globals */
import * as XLSX from 'xlsx';
import { executeCommand } from '../engine/commandEngine';

// State in Worker
let rawData = [];
let currentData = [];

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
                // Excel / CSV
                const wb = XLSX.read(buffer, { type: 'array' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                rows = XLSX.utils.sheet_to_json(ws, { defval: "NA" });
            }

            // Update State
            rawData = rows;
            currentData = rows;

            // Send back simple stats + subset? No, we need full data for virtual list usually.
            // But for huge data, maybe we only send window? 
            // For now, let's send full data back. React-window handles the rendering if memory allows.
            // If millions of rows, we should implement windowing protocol (requesting range).
            // Given "Freeze" issue is often parsing, this solves parsing freeze.
            // Rendering freeze is solved by react-window.

            self.postMessage({ type: 'DATA_LOADED', payload: rows });
        }

        if (type === 'RUN_COMMAND') {
            const result = executeCommand(payload, rawData); // Always filter from Raw for "FILTER"?

            // Wait, our previous logic was:
            // FILTER -> Subset of Raw
            // SORT -> Reorder of Current or Raw?

            // Let's replicate logic:
            // If command is "FILTER...", we filter rawData.
            // If command is "SORT...", we sort result? Or rawData?

            // Standard: Apply transformation to rawData.
            // Re-using executeCommand which returns a NEW array.

            if (Array.isArray(result)) {
                currentData = result;
                self.postMessage({ type: 'DATA_UPDATED', payload: result });
            } else {
                // Stats or error
                self.postMessage({ type: 'COMMAND_RESULT', payload: result });
            }
        }

        if (type === 'RESET') {
            currentData = rawData;
            self.postMessage({ type: 'DATA_UPDATED', payload: rawData });
        }

    } catch (error) {
        self.postMessage({ type: 'ERROR', payload: error.message });
    }
};
