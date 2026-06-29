import * as XLSX from 'xlsx'
// @ts-expect-error - papaparse has no type declarations
import Papa from 'papaparse'

export interface ParsedSheet {
  name: string
  data: (string | null)[][]
}

export function parseXlsx(buffer: ArrayBuffer): ParsedSheet[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
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
    return { name, data }
  })
}

export function parseCsv(text: string): (string | null)[][] {
  const result = Papa.parse<(string | null)[]>(text, {
    header: false,
    skipEmptyLines: true,
    dynamicTyping: false,
  })
  return result.data
}
