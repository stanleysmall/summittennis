const SCRIPT_PROP = PropertiesService.getScriptProperties(); 
const SHEET_PLAYERS = "Players";
const SHEET_COURTS = "Courts";
const SHEET_ROUNDS = "Rounds";
const TIMEZONE = "America/Denver";

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const doc = SpreadsheetApp.getActiveSpreadsheet();
    
    // --- Helper: Clean Data Reader ---
    // Trims all headers and string values to avoid whitespace issues
    function readSheetClean(sheetName) {
      const s = doc.getSheetByName(sheetName);
      if (!s) return [];
      const rawData = s.getDataRange().getValues();
      if (rawData.length < 2) return [];

      const headers = rawData[0].map(h => String(h).trim());
      const rows = rawData.slice(1);

      return rows.map(row => {
        const obj = {};
        headers.forEach((h, i) => {
          let val = row[i];
          if (typeof val === 'string') val = val.trim();
          obj[h] = val;
        });
        return obj;
      });
    }

    // --- Helper: Robust Date Check ---
    function isRoundOpen(deadlineStr) {
      if (!deadlineStr) return false;
      
      // 1. Get Denver Time as Integer (YYYYMMDDHHmmss)
      const now = new Date();
      const nowStr = Utilities.formatDate(now, TIMEZONE, "yyyyMMddHHmmss");
      const nowNum = Number(nowStr);

      // 2. Parse Deadline cleanly
      // Regex matches "01", "30", "2026" from "01/30/2026" or "1-30-26" etc.
      const match = String(deadlineStr).match(/(\d+)[^0-9](\d+)[^0-9](\d+)/);
      if (!match) return false; 

      // Assuming MM/DD/YYYY format based on your CSV
      let mm = match[1].padStart(2, '0');
      let dd = match[2].padStart(2, '0');
      let yyyy = match[3];
      if (yyyy.length === 2) yyyy = "20" + yyyy; // Handle 2-digit year

      // Create Deadline Integer (End of Day: 235959)
      const deadlineNum = Number(`${yyyy}${mm}${dd}235959`);

      return nowNum <= deadlineNum;
    }

    // 1. Handle GET
    if (e.parameter.action === 'read') {
      const targetId = e.parameter.id;
      const targetPass = e.parameter.password;
      if (!targetId || !targetPass) throw new Error("Missing credentials");

      const players = readSheetClean(SHEET_PLAYERS);
      const user = players.find(p => p.id === targetId && p.password === targetPass);
      
      if (!user) throw new Error("User not found or credentials incorrect");

      const courts = readSheetClean(SHEET_COURTS);
      const rounds = readSheetClean(SHEET_ROUNDS);

      return ContentService.createTextOutput(JSON.stringify({ 
          status: 'success', 
          user: user, 
          courts: courts, 
          rounds: rounds 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Handle POST
    if (e.postData) {
      const payload = JSON.parse(e.postData.contents);
      const updateData = payload.data;
      const authId = payload.id;
      const authPass = payload.password;

      // Direct Sheet Access for Writing
      const sheet = doc.getSheetByName(SHEET_PLAYERS);
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

      const idIndex = headers.indexOf("id");
      const passIndex = headers.indexOf("password");

      // Find Row (using loose comparison after trim)
      const rowIndex = data.findIndex(row => 
        String(row[idIndex]).trim() === authId && 
        String(row[passIndex]).trim() === authPass
      );

      if (rowIndex === -1) throw new Error("Authentication failed during update");

      // --- BACKEND VALIDATION ---
      const rounds = readSheetClean(SHEET_ROUNDS);
      
      // Sort rounds by deadline date (Using basic JS date parse for sort, robust enough usually)
      rounds.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

      // Identify the ONE open round
      let openRoundKey = null;
      for (const r of rounds) {
        if (isRoundOpen(r.deadline)) {
          openRoundKey = r.key;
          break; // Found the active round
        }
      }

      // Check incoming changes
      for (const key of Object.keys(updateData)) {
        if (key.startsWith('round')) {
          
          // If this key is NOT the open round, check if value actually changed
          if (key !== openRoundKey) {
             const colIdx = headers.indexOf(key);
             if (colIdx === -1) continue; // Column doesn't exist, ignore

             const currentVal = data[rowIndex][colIdx];
             const newVal = updateData[key];

             // Normalize for boolean comparison
             const boolCurrent = (currentVal === true || String(currentVal).toUpperCase() === 'TRUE');
             const boolNew = (newVal === true || String(newVal).toUpperCase() === 'TRUE');

             // Only throw if they are DIFFERENT (trying to edit)
             if (boolCurrent !== boolNew) {
                // Determine reason for clearer error
                let reason = "closed";
                // Quick check if it's future
                const r = rounds.find(rd => rd.key === key);
                if (r) {
                   const now = new Date();
                   if (new Date(r.start) > now) reason = "not yet open";
                }
                throw new Error(`You cannot change your status for ${key}. It is ${reason}.`);
             }
          }
        }
      }
      // --------------------------

      const protectedFields = ['ladder_active', 'ladder_rank', 'rating', 'id', 'updated'];
      const rowToUpdate = data[rowIndex];

      for (const [key, value] of Object.entries(updateData)) {
        if (protectedFields.includes(key)) continue;
        
        const colIndex = headers.indexOf(key);
        if (colIndex > -1) {
          let val = value;
          // Ensure booleans are written as booleans, not strings
          if (val === 'true' || val === true) val = true;
          else if (val === 'false' || val === false) val = false;
          
          rowToUpdate[colIndex] = val;
        }
      }

      // Update Timestamp
      const updatedColIndex = headers.indexOf('updated');
      if (updatedColIndex > -1) {
        rowToUpdate[updatedColIndex] = new Date();
      }

      sheet.getRange(rowIndex + 2, 1, 1, sheet.getLastColumn()).setValues([rowToUpdate]);

      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Profile updated' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
