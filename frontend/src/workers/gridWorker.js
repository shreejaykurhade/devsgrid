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

            // Update State - Deep clone to ensure rawData stays immutable
            rawData = JSON.parse(JSON.stringify(rows));
            currentData = JSON.parse(JSON.stringify(rows));

            console.log('FILE LOADED:', rawData.length, 'rows saved to rawData');
            self.postMessage({ type: 'DATA_LOADED', payload: rows });
        }

        if (type === 'RUN_COMMAND') {
            console.log('COMMAND:', payload);

            // Determine which dataset to use
            // Only "Missing Data" and "Has Data" preset filters use rawData (independent)
            // Everything else (SORT, regular FILTER) uses currentData (chainable)
            const isNAPresetFilter = payload.includes('= "NA"') || payload.includes('!= "NA"');
            const sourceData = isNAPresetFilter ? rawData : currentData;

            console.log('Using', isNAPresetFilter ? 'rawData' : 'currentData', '|', sourceData.length, 'rows');

            const result = executeCommand(payload, sourceData);

            if (Array.isArray(result)) {
                currentData = result;
                console.log('RESULT:', result.length, 'rows');
                self.postMessage({ type: 'DATA_UPDATED', payload: result });
            } else {
                // Stats or error
                self.postMessage({ type: 'COMMAND_RESULT', payload: result });
            }
        }

        if (type === 'RESET') {
            // Deep clone rawData to ensure currentData is independent
            currentData = JSON.parse(JSON.stringify(rawData));
            console.log('RESET: Restoring', rawData.length, 'rows');
            self.postMessage({ type: 'DATA_UPDATED', payload: currentData });
        }

    } catch (error) {
        self.postMessage({ type: 'ERROR', payload: error.message });
    }
};
