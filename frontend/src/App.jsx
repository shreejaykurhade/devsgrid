import { useState, useEffect, useRef } from 'react';
import DataGrid from './components/DataGrid';
import Toolbar from './components/Toolbar';
import CommandBar from './components/CommandBar';
import './styles.css';

import ErrorBoundary from './components/ErrorBoundary';
import { saveSession, loadSession, refreshSession, updateSessionData } from './services/db';

// Import Worker using Vite's special syntax
import GridWorker from './workers/gridWorker?worker';

function App() {
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  /* Visibility State - Combined */
  const [areToolsVisible, setAreToolsVisible] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ASC' });
  const [selectionStats, setSelectionStats] = useState({ count: 0 });

  // Worker Reference
  const workerRef = useRef(null);

  // DataGrid Reference (for resetLayout)
  const dataGridRef = useRef(null);

  // --- Handlers (Defined before useEffect to be safe) ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setFileName(file.name);

    // Read buffer and send to worker
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const buffer = evt.target.result;

      // Save to DB
      saveSession(buffer, file.name).catch(err => console.error("Save failed", err));

      if (workerRef.current) {
        workerRef.current.postMessage({
          type: 'LOAD_FILE',
          payload: { buffer, fileName: file.name }
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCommand = (cmd) => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'RUN_COMMAND', payload: cmd });
    }
  };

  const handleFilterChange = (filter) => {
    // Special handling for non-filter ops coming from Toolbar
    if (filter.op === 'SORT') {
      if (!filter.col) return alert("Select a column first.");
      handleCommand(`SORT "${filter.col}" ${filter.val}`);
      return;
    }
    if (filter.op === 'TRIM') {
      if (!filter.col) return alert("Select a column first.");
      handleCommand(`TRIM ${filter.col}`);
      return;
    }

    if (!filter.col || !filter.op) return;
    // Allow empty val for exact matches (e.g. searching for blanks)
    const cmd = `FILTER ${filter.col} ${filter.op} "${filter.val}"`;
    handleCommand(cmd);
  };

  const handleSort = (colName) => {
    let direction = 'ASC';
    if (sortConfig.key === colName && sortConfig.direction === 'ASC') {
      direction = 'DESC';
    }
    setSortConfig({ key: colName, direction });
    handleCommand(`SORT "${colName}" ${direction}`);
  };

  const handleReset = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'RESET' });
    }
  };

  const handleCellUpdate = (rowIndex, col, value) => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'UPDATE_CELL',
        payload: { rowIndex, col, value }
      });
    }
  };

  const handleDeleteRow = (rowIndex) => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'DELETE_ROW',
        payload: { rowIndex }
      });
    }
  };

  const handleDeleteRows = (rowIndices) => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'DELETE_ROWS',
        payload: { rowIndices }
      });
    }
  };

  useEffect(() => {
    // Initialize Worker
    workerRef.current = new GridWorker();

    // Listen
    workerRef.current.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'DATA_LOADED' || type === 'DATA_UPDATED') {
        setData(payload);
        if (payload.length > 0) {
          setColumns(Object.keys(payload[0]));
        }
        setLoading(false);
      }
      if (type === 'EXPORT_READY') {
        const { content, format, mimeType } = payload;
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `export.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setLoading(false);
      }

      if (type === 'SESSION_SAVE_NEEDED') {
        // Request current state to persist
        workerRef.current.postMessage({ type: 'EXPORT_RAW_JSON' });
      }
      if (type === 'RAW_JSON_EXPORT') {
        const payloadData = payload;
        // Save to DB
        updateSessionData(payloadData);
      }
      if (type === 'ERROR') {
        alert(`Error: ${payload}`);
        setLoading(false);
      }
      if (type === 'COMMAND_RESULT') {
        alert(JSON.stringify(payload, null, 2));
      }
    };

    // Check for previous session
    const checkSession = async () => {
      try {
        const session = await loadSession();
        if (session) {
          setLoading(true);
          setFileName(session.fileName + ' (Restored)');

          // 1. Load Original File (sets rawData baseline in worker)
          workerRef.current.postMessage({
            type: 'LOAD_FILE',
            payload: { buffer: session.fileBuffer, fileName: session.fileName }
          });

          // 2. If we have persisted edits, apply them (sets currentData in worker)
          if (session.currentData) {
            workerRef.current.postMessage({
              type: 'LOAD_EXISTING_DATA',
              payload: session.currentData
            });
          }
        }
      } catch (err) {
        console.error("Session restore failed", err);
      }
    };
    checkSession();

    // Exposed for Reset Button
    const handleReset = async () => {
      try {
        const session = await loadSession();
        if (session) {
          // Clear persisted edits
          updateSessionData(null);
          // Reload original
          setLoading(true);
          workerRef.current.postMessage({
            type: 'LOAD_FILE',
            payload: { buffer: session.fileBuffer, fileName: session.fileName }
          });
        }
      } catch (e) { console.error("Reset failed", e); }
    };

    // Heartbeat: Keep session alive while tab is open
    const intervalId = setInterval(() => {
      refreshSession();
    }, 5000); // 5 seconds

    return () => {
      clearInterval(intervalId);
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  /* Alignment Styles */
  const controlRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    padding: '10px 0' // Add some vertical breathing room
  };

  return (
    <div className="app-container">
      <div className="controls">
        <div className="control-row" style={{ ...controlRowStyle, justifyContent: 'space-between' }}>

          <div className="upload-section" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="file-input-wrapper">
              <button className="btn-upload">📂 Upload Data</button>
              <input
                type="file"
                id="file-upload"
                name="file-upload"
                onChange={handleFileUpload}
                accept=".csv, .xlsx, .xls, .json"
              />
            </div>

            {data.length > 0 && (
              <>
                {/* Combined Toggle */}
                <button
                  onClick={() => setAreToolsVisible(!areToolsVisible)}
                  style={{ minWidth: '140px' }} // Ensure consistent width
                >
                  {areToolsVisible ? 'Hide Tools' : 'Show Tools'}
                </button>

                {/* Reset Layout Button */}
                <button
                  onClick={() => dataGridRef.current?.resetLayout()}
                  style={{ minWidth: '140px' }}
                  title="Reset column widths to default"
                >
                  ↻ Reset Layout
                </button>

                {/* Export Dropdown - Aligned */}
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleCommand(`EXPORT ${e.target.value}`);
                      e.target.value = '';
                    }
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    background: '#f8f9fa',
                    cursor: 'pointer',
                    fontWeight: '500',
                    height: '36px' // Match button height
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>⬇ Export Data</option>
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="sql">SQL Insert</option>
                  <option value="md">Markdown</option>
                </select>

                {/* Sort Controls Validation - Removed as per request */}
              </>
            )}
          </div>
        </div>

        {areToolsVisible && (
          <>
            <div className="control-row">
              <Toolbar columns={columns} onFilterApply={handleFilterChange} onReset={handleReset} />
            </div>
            <div className="control-row">
              <CommandBar onCommand={handleCommand} />
            </div>
          </>
        )}
      </div>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ErrorBoundary>
          {loading ? (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              fontSize: '1.2rem',
              fontWeight: '500',
              color: '#5c6c7f',
              background: '#ffffff'
            }}>
              Processing...
            </div>
          ) : (
            <DataGrid
              ref={dataGridRef}
              data={data}
              columns={columns}
              onSort={handleSort}
              onCellEdit={handleCellUpdate}
              onSelectionChange={setSelectionStats}
              onDeleteRow={handleDeleteRow}
              onDeleteRows={handleDeleteRows}
            />
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}
export default App;
