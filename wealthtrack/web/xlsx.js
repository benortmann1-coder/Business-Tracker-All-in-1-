/* Minimal, dependency-free .xlsx and .csv writers (works offline).
 * buildXlsx([{name, columns:[{header, type:'text'|'money'|'date'|'number', width}], rows:[[...]]}]) -> Uint8Array
 * Money values are passed as integer cents and written as exact decimals.
 */
(function (root) {
  'use strict';
  const te = new TextEncoder();
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) { // [{name, data: Uint8Array}] — STORE method
    const parts = [], central = []; let offset = 0;
    const u16 = n => [n & 255, (n >>> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    for (const f of files) {
      const name = te.encode(f.name), crc = crc32(f.data), sz = f.data.length;
      const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(name.length), ...u16(0)]);
      parts.push(local, name, f.data);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
      offset += local.length + name.length + sz;
    }
    const cdSize = central.reduce((a, p) => a + p.length, 0);
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
    const all = parts.concat(central, [end]); const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
    let o = 0; for (const p of all) { out.set(p, o); o += p.length; } return out;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const centsStr = c => { const n = c < 0; c = Math.abs(c); return (n ? '-' : '') + Math.floor(c / 100) + '.' + String(c % 100).padStart(2, '0'); };
  function dateSerial(s) { const [y, m, d] = s.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000); }

  function sheetXml(sh) {
    const cols = sh.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || (c.type === 'money' ? 14 : c.type === 'date' ? 12 : 18)}" customWidth="1"/>`).join('');
    let rows = `<row r="1">${sh.columns.map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="1"><is><t>${esc(c.header)}</t></is></c>`).join('')}</row>`;
    sh.rows.forEach((r, ri) => {
      const rn = ri + 2;
      rows += `<row r="${rn}">` + r.map((v, ci) => {
        const ref = colName(ci) + rn, type = sh.columns[ci].type;
        if (v == null || v === '') return '';
        // Text always goes in as an inline string (t="inlineStr"): Excel never evaluates those as formulas.
        if (type === 'money' && typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}" s="2"><v>${centsStr(Math.round(v))}</v></c>` : '';
        if (type === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const n = dateSerial(v); return Number.isFinite(n) ? `<c r="${ref}" s="3"><v>${n}</v></c>` : ''; }
        if (type === 'number' && typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : '';
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      }).join('') + '</row>';
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`;
  }
  function buildXlsx(sheets) {
    const f = (name, s) => ({ name, data: te.encode(s) });
    const names = sheets.map((s, i) => (s.name || 'Sheet' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    return zip([
      f('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
      f('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
      f('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
      f('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
      f('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00;[Red]\\-&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf fontId="1" applyFont="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/></cellXfs></styleSheet>`),
      ...sheets.map((s, i) => f(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s))),
    ]);
  }
  function buildCsv(sheet) {
    const q = v => { if (v == null) return ''; const s = String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    // CSV/formula injection: a text cell starting with = + - @ TAB or CR would run as a formula
    // when the CSV is opened in Excel/Sheets, so prefix it with an apostrophe (OWASP guidance).
    const safeText = v => { const s = String(v); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; };
    const cell = (v, type) => {
      if (v == null) return '';
      if (typeof v === 'number') { if (!Number.isFinite(v)) return ''; return type === 'money' ? centsStr(Math.round(v)) : String(v); }
      return safeText(v);
    };
    const lines = [sheet.columns.map(c => q(safeText(c.header))).join(',')];
    for (const r of sheet.rows) lines.push(r.map((v, i) => q(cell(v, sheet.columns[i].type))).join(','));
    return '﻿' + lines.join('\r\n');
  }
  const api = { buildXlsx, buildCsv, zip, crc32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WTXlsx = api;
})(typeof window !== 'undefined' ? window : globalThis);
