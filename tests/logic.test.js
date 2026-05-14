// A simple test for the strict Denver Time Parser you wrote
function parseDeadline(dateInput) {
    if (!dateInput) return null;
    let dStr = String(dateInput);
    if (dStr.indexOf('GMT') === -1 && dStr.indexOf('Z') === -1 && dStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
        return new Date(dStr); 
    }
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
    });

    test('Returns null for invalid input', () => {
        const result = parseDeadline("not-a-date");
        expect(result).toBeNull();
    });
});