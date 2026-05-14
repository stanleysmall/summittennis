const SCRIPT_PROP = PropertiesService.getScriptProperties(); 
const SHEET_PLAYERS = "Players";
const SHEET_COURTS = "Courts";
const SHEET_ROUNDS = "Rounds";
// STRICTLY ENFORCE DENVER TIME
const TIMEZONE = "America/Denver";

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const doc = SpreadsheetApp.getActiveSpreadsheet();
    
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

    // --- STRICT DENVER TIME CHECK ---
    function isRoundOpen(deadlineInput) {
      if (!deadlineInput) return false;
      
      const now = new Date();
      let deadlineDate;

      // Case 1: Input is already a Date Object (Cell format is Date/Time)
      if (deadlineInput instanceof Date) {
        // We assume the sheet timestamp IS Denver time.
        // We format it to a string string "yyyy-MM-dd HH:mm:ss" in Denver Zone
        const dateString = Utilities.formatDate(deadlineInput, TIMEZONE, "yyyy-MM-dd HH:mm:ss");
        // Then parse it back to get the absolute timestamp
        deadlineDate = Utilities.parseDate(dateString, TIMEZONE, "yyyy-MM-dd HH:mm:ss");
      } 
      // Case 2: Input is String (e.g. "1/31/2026 0:00:00")
      else {
        // We explicitly tell Google: "This string is in America/Denver time"
        // Try common formats
        deadlineDate = Utilities.parseDate(String(deadlineInput), TIMEZONE, "M/d/yyyy H:mm:ss");
        if (!deadlineDate || isNaN(deadlineDate.getTime())) {
           // Fallback try without seconds or specific formats if needed
           deadlineDate = new Date(deadlineInput); 
        }
      }

      if (!deadlineDate || isNaN(deadlineDate.getTime())) return false;

      // Compare: Now (Server Time) <= Deadline (Denver Time)
      return now.getTime() <= deadlineDate.getTime();
    }

    // 1. Handle GET (Profile Read)
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

    // 2. Handle GET (Looking to Play Board)
    if (e.parameter.action === 'get_looking') {
      const players = readSheetClean(SHEET_PLAYERS);
      const result = [];
      const availCols = ['mon_m', 'mon_a', 'mon_e', 'tue_m', 'tue_a', 'tue_e', 'wed_m', 'wed_a', 'wed_e', 'thu_m', 'thu_a', 'thu_e', 'fri_m', 'fri_a', 'fri_e', 'sat_m', 'sat_a', 'sat_e', 'sun_m', 'sun_a', 'sun_e'];

      players.forEach(p => {
        const isLooking = p.looking === true || String(p.looking).toUpperCase() === 'TRUE';
        
        if (isLooking) {
          let avail = {};
          availCols.forEach(col => {
             avail[col] = (p[col] === true || String(p[col]).toUpperCase() === 'TRUE');
          });

          // Format phone number nicely (XXX) XXX-XXXX
          let rawPhone = String(p.phone || '').replace(/\D/g, '');
          let phoneFmt = rawPhone.length === 10 ? `(${rawPhone.substring(0,3)}) ${rawPhone.substring(3,6)}-${rawPhone.substring(6,10)}` : rawPhone;
          let lastInitial = p.last_name ? String(p.last_name).charAt(0) + "." : "";

          result.push({
            name: (p.first_name || "") + " " + lastInitial,
            rating: p.rating || "N/A",
            phone: phoneFmt,
            email: p.email || "",
            availability: avail
          });
        }
      });

      return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: result })).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. Handle POST (Profile Updates)
    if (e.postData) {
      const payload = JSON.parse(e.postData.contents);
      const updateData = payload.data;
      const authId = payload.id;
      const authPass = payload.password;

      const sheet = doc.getSheetByName(SHEET_PLAYERS);
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

      const idIndex = headers.indexOf("id");
      const passIndex = headers.indexOf("password");

      const rowIndex = data.findIndex(row => 
        String(row[idIndex]).trim() === authId && 
        String(row[passIndex]).trim() === authPass
      );

      if (rowIndex === -1) throw new Error("Authentication failed during update");

      // --- BACKEND VALIDATION ---
      const rounds = readSheetClean(SHEET_ROUNDS);
      
      // Sort rounds by deadline
      rounds.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

      // Find the ONE open round
      let openRoundKey = null;
      for (const r of rounds) {
        if (isRoundOpen(r.deadline)) {
          openRoundKey = r.key;
          break; // Found the active round
        }
      }

      for (const key of Object.keys(updateData)) {
        if (key.startsWith('round')) {
          if (key !== openRoundKey) {
             const colIdx = headers.indexOf(key);
             if (colIdx === -1) continue; 

             const currentVal = data[rowIndex][colIdx];
             const newVal = updateData[key];
             const boolCurrent = (currentVal === true || String(currentVal).toUpperCase() === 'TRUE');
             const boolNew = (newVal === true || String(newVal).toUpperCase() === 'TRUE');

             if (boolCurrent !== boolNew) {
                let reason = "closed";
                // If start is future, clarify
                const r = rounds.find(rd => rd.key === key);
                if (r && new Date(r.start) > new Date()) reason = "not yet open";
                
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
          if (val === 'true' || val === true) val = true;
          else if (val === 'false' || val === false) val = false;
          rowToUpdate[colIndex] = val;
        }
      }

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
