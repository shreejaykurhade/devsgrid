export function executeCommand(cmd, dataset) {
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0].toUpperCase();

    // Dataset might be just the array or the full object
    // Standardize: dataset passed here is expected to be { data: [rows] } or just [rows]
    let rows = Array.isArray(dataset) ? dataset : (dataset.data || []);

    if (command === "FILTER") {
        // Format: FILTER col > val
        // Very basic parsing
        const col = parts[1];
        const op = parts[2];
        let val = parts.slice(3).join(" "); // allow spaces in value if simple

        // Strip quotes if present
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }

        // Naively handle number conversion
        const numericVal = Number(val);
        const finalVal = isNaN(numericVal) ? val : numericVal;

        return rows.filter(row => {
            const rowVal = row[col];

            // Special handling for NA checks
            if (val === "NA") {
                if (op === "=" || op === "==") return rowVal === "NA" || rowVal === null || rowVal === undefined || rowVal === "";
                if (op === "!=" || op === "!==") return rowVal !== "NA" && rowVal !== null && rowVal !== undefined && rowVal !== "";
            }

            // Skip NA values for other operations
            if (rowVal === "NA" || rowVal === null || rowVal === undefined) return false;

            // Handle numeric comparison if both are numbers
            if (typeof rowVal === 'number' && typeof finalVal === 'number') {
                if (op === ">") return rowVal > finalVal;
                if (op === "<") return rowVal < finalVal;
                if (op === "=" || op === "==") return rowVal == finalVal;
                if (op === "!=" || op === "!==") return rowVal != finalVal;
                if (op === ">=") return rowVal >= finalVal;
                if (op === "<=") return rowVal <= finalVal;
            }

            // Fallback or string comparison
            if (op === "=" || op === "==") return String(rowVal).toLowerCase() === String(finalVal).toLowerCase();
            if (op === "!=" || op === "!==") return String(rowVal).toLowerCase() !== String(finalVal).toLowerCase();
            if (op === "contains") return String(rowVal).toLowerCase().includes(String(finalVal).toLowerCase());

            // Basic lex sort for strings
            if (op === ">") return rowVal > finalVal;
            if (op === "<") return rowVal < finalVal;

            return false;
        });
    }

    if (command === "SORT") {
        // Format: SORT "col" DESC/ASC or SORT col DESC/ASC
        let col = parts[1];

        // Strip quotes if present
        if ((col.startsWith('"') && col.endsWith('"')) || (col.startsWith("'") && col.endsWith("'"))) {
            col = col.slice(1, -1);
        }

        const direction = parts[2] ? parts[2].toUpperCase() : "ASC";

        return [...rows].sort((a, b) => {
            const valA = a[col];
            const valB = b[col];

            if (valA === "NA") return 1;
            if (valB === "NA") return -1;

            if (valA === valB) return 0;

            if (direction === "DESC") {
                return valA < valB ? 1 : -1;
            } else {
                return valA > valB ? 1 : -1;
            }
        });
    }

    if (command === "SELECT") {
        const cols = parts.slice(1).join("").split(",").map(c => c.trim());
        return rows.map(row => {
            const newRow = {};
            cols.forEach(c => {
                if (row.hasOwnProperty(c)) newRow[c] = row[c];
            });
            return newRow;
        });
    }

    if (command === "STATS") {
        const col = parts[1];
        const values = rows
            .map(r => r[col])
            .filter(v => v !== "NA" && !isNaN(Number(v)))
            .map(v => Number(v));

        if (values.length === 0) return { count: 0, sum: 0, avg: 0 };

        const sum = values.reduce((a, b) => a + b, 0);
        return {
            column: col,
            count: values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            sum: sum,
            avg: sum / values.length
        };
    }

    return rows;
}
