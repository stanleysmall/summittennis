// A simple test for the strict Denver Time Parser you wrote
function parseDeadline(dateInput) {
    if (!dateInput) return null;
    let dStr = String(dateInput);
    
    // Match M/D/YYYY or MM/DD/YYYY with optional time
    const match = dStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(.*)$/);
    if (match) {
        const month = parseInt(match[1], 10) - 1; // Convert to 0-indexed
        const day = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        const timeStr = match[4];
        
        // Parse time if present, otherwise use 00:00:00
        let hours = 0, minutes = 0, seconds = 0;
        if (timeStr) {
            const timeParts = timeStr.match(/(\d{1,2}):(\d{1,2}):(\d{1,2})/);
            if (timeParts) {
                hours = parseInt(timeParts[1], 10);
                minutes = parseInt(timeParts[2], 10);
                seconds = parseInt(timeParts[3], 10);
            }
        }
        
        const d = new Date(year, month, day, hours, minutes, seconds);
        if (!isNaN(d.getTime())) return d;
    }
    
    // Fallback for other date formats (ISO, GMT, Z notation, etc.)
    let d = new Date(dateInput);
    if (!isNaN(d.getTime())) return d;
    return null;
}

describe('Time Parsing Logic', () => {
    test('Correctly parses standard formatted dates', () => {
        const result = parseDeadline("4/3/2026 0:00:00");
        expect(result).not.toBeNull();
        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(3); // Months are 0-indexed in JS (April = 3)
        expect(result.getDate()).toBe(3);
    });

    test('Returns null for invalid input', () => {
        const result = parseDeadline("not-a-date");
        expect(result).toBeNull();
    });
});
