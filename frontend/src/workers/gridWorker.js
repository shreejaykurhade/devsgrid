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

            // Handle EXPORT command specifically
            if (payload.startsWith('EXPORT ')) {
                const format = payload.split(' ')[1]?.toLowerCase();
                if (!format) return;

                console.log(`Exporting ${currentData.length} rows as ${format}`);
                let content = '';
                let mimeType = 'text/plain';

                if (format === 'json') {
                    content = JSON.stringify(currentData, null, 2);
                    mimeType = 'application/json';
                } else if (format === 'csv') {
                    const ws = XLSX.utils.json_to_sheet(currentData);
                    content = XLSX.write({ Sheets: { data: ws }, SheetNames: ['data'] }, { bookType: 'csv', type: 'string' });
                    mimeType = 'text/csv';
                } else if (format === 'sql') {
                    const tableName = 'devsgrid_export';
                    content = currentData.map(row => {
                        const cols = Object.keys(row).join(', ');
                        const vals = Object.values(row).map(v => typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v).join(', ');
                        return `INSERT INTO ${tableName} (${cols}) VALUES (${vals});`;
                    }).join('\n');
                    mimeType = 'application/sql';
                } else if (format === 'md') {
                    if (currentData.length > 0) {
                        const cols = Object.keys(currentData[0]);
                        const header = `| ${cols.join(' | ')} |`;
                        const divider = `| ${cols.map(() => '---').join(' | ')} |`;
                        const rows = currentData.map(row => `| ${cols.map(c => row[c]).join(' | ')} |`).join('\n');
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
