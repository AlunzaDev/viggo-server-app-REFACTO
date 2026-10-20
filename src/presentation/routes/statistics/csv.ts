/**
 * One CSV line. Objects (a stay breakdown, the connectivity list) go as JSON; text that a
 * spreadsheet would run as a formula (=, +, -, @) is prefixed so it stays text.
 */
export const csvRow = (cells: unknown[]) => cells.map((cell) => {
  let text = cell === null || cell === undefined ? "" : typeof cell === "object" ? JSON.stringify(cell) : String(cell);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}).join(",") + "\r\n";
