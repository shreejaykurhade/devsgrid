export function filterData(data, rules) {
    return data.filter(row =>
        rules.every(r => {
            // If the column value is "NA", it generally fails comparison unless checking for NA explicitly
            if (row[r.col] === "NA") return false;

            const val = row[r.col];
            const target = r.val;

            // Handle numeric conversions for comparison if possible
            const numVal = Number(val);
            const numTarget = Number(target);
            const isNum = !isNaN(numVal) && !isNaN(numTarget);

            switch (r.op) {
                case ">": return isNum ? numVal > numTarget : val > target;
                case "<": return isNum ? numVal < numTarget : val < target;
                case ">=": return isNum ? numVal >= numTarget : val >= target;
                case "<=": return isNum ? numVal <= numTarget : val <= target;
                case "=": return val == target;
                case "!=": return val != target;
                case "contains": return String(val).toLowerCase().includes(String(target).toLowerCase());
                default: return false;
            }
        })
    );
}
