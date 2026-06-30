import * as XLSX from 'xlsx'
// @ts-expect-error - papaparse has no type declarations
import Papa from 'papaparse'

export interface ParsedSheet {
  name: string
  data: (string | null)[][]
  colWidths?: number[]
}

export function parseXlsx(buffer: ArrayBuffer): ParsedSheet[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, cellStyles: true })
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name]!
    const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: false,
      dateNF: 'YYYY-MM-DD HH:mm:ss',
    })
    const data: (string | null)[][] = raw.map(row =>
      row.map(cell => {
        if (cell == null) return null
        return String(cell)
      })
    )
    // Extract column widths from the worksheet
    let colWidths: number[] | undefined
    if (sheet['!cols']) {
      const arr: number[] = []
      for (const col of sheet['!cols']) {
        if (col && col.hidden) {
          arr.push(0)
        } else if (col.wpx) {
          // wpx is already in pixels
          arr.push(Math.max(40, col.wpx))
        } else if (col.wch) {
          // wch → approximate pixel: character count × ~8px at 12px font
          arr.push(Math.max(60, Math.round(col.wch * 8)))
        } else if (col.width) {
          arr.push(Math.max(60, Math.round(col.width * 8)))
        } else {
          arr.push(0) // auto/default
        }
      }
      colWidths = arr
    }
    // Fallback: compute widths from data length when file has no !cols
    if (!colWidths) {
      colWidths = computeColWidths(data)
    }
    return { name, data, colWidths }
  })
}

/**
 * Compute column widths from data content when the file has no stored column widths.
 * Each column's width is based on the longest cell value (chars × 8px, capped at 60-400px).
 */
function computeColWidths(data: (string | null)[][]): number[] {
  const maxCols = Math.max(...data.map(r => r.length), 0)
  const maxLens = Array(maxCols).fill(0)
  for (const row of data) {
    for (let i = 0; i < row.length; i++) {
      const cell = row[i]
      if (cell != null) {
        maxLens[i] = Math.max(maxLens[i]!, cell.length)
      }
    }
  }
  return maxLens.map(len => Math.max(60, Math.min(400, len * 8)))
}

export function parseCsv(text: string): (string | null)[][] {
  const result = Papa.parse<(string | null)[]>(text, {
    header: false,
    skipEmptyLines: true,
    dynamicTyping: false,
  })
  return result.data
}
