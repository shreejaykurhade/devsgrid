import { useState, useEffect, useRef } from 'react';
import DataGrid from './components/DataGrid';
import Toolbar from './components/Toolbar';
import CommandBar from './components/CommandBar';
import './styles.css';

import ErrorBoundary from './components/ErrorBoundary';
import { saveSession, loadSession } from './services/db';

// Import Worker using Vite's special syntax
import GridWorker from './workers/gridWorker?worker';

function App() {
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');

  // Worker Reference
  const workerRef = useRef(null);

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
          workerRef.current.postMessage({
            type: 'LOAD_FILE',
            payload: { buffer: session.fileBuffer, fileName: session.fileName }
          });
        }
      } catch (err) {
        console.error("Session restore failed", err);
      }
    };
    checkSession();

    return () => {
      workerRef.current.terminate();
    };
  }, []);

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

      workerRef.current.postMessage({
        type: 'LOAD_FILE',
        payload: { buffer, fileName: file.name }
      });
      // Note: we transfer buffer if possible for performance, but overhead is okay for now
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCommand = (cmd) => {
    workerRef.current.postMessage({ type: 'RUN_COMMAND', payload: cmd });
  };

  const handleFilterChange = (filter) => {
    if (!filter.col || !filter.op || filter.val === '') return;
    const cmd = `FILTER ${filter.col} ${filter.op} ${filter.val}`;
    handleCommand(cmd);
  };

  const handleReset = () => {
    workerRef.current.postMessage({ type: 'RESET' });
  };

  return (
    <div className="app-container">
      {/* Header Removed as per request */}

      <div className="controls">
        <div className="control-row">
          <div className="upload-section">
            <div className="file-input-wrapper">
              <button className="btn-upload">📂 Upload Data</button>
              <input type="file" onChange={handleFileUpload} accept=".csv, .xlsx, .xls, .json" />
            </div>
          </div>
          <Toolbar columns={columns} onFilterApply={handleFilterChange} onReset={handleReset} />
        </div>

        <div className="control-row">
          <CommandBar onCommand={handleCommand} />
        </div>
      </div>

      <main>
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
            <DataGrid data={data} columns={columns} />
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default App;
