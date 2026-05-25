// Minimal CSV builder + browser download trigger. Used by Reports
// (occupancy / payments / OTA / invoices). Outputs UTF-8 with a BOM
// so Excel / Google Sheets open it without mojibake on Indian /
// Western European characters in names. Cells are quoted only when
// they contain a comma, quote, or newline.
//
// Why CSV (not xlsx): xlsx needs a binary writer (~80 KB extra). CSV
// opens in Excel just fine, doesn't add a dependency, and rates /
// occupancy / payment data is intrinsically tabular. If the hotelier
// asks for formatted xlsx later, swap this helper for sheetjs.

function escapeCell(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Build a CSV string from rows. Each row is an array of cells.
export function buildCsv(headerRow, dataRows) {
  const lines = [];
  if (headerRow) lines.push(headerRow.map(escapeCell).join(','));
  for (const row of dataRows) {
    lines.push(row.map(escapeCell).join(','));
  }
  // BOM + CRLF — what Excel expects for clean UTF-8 import.
  return '﻿' + lines.join('\r\n');
}

// Trigger a browser download of CSV content as <filename>.
export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Slight defer so Firefox / Safari finish the download trigger
  // before we revoke the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
