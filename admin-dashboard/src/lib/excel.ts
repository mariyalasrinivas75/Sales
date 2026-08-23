import * as XLSX from "xlsx";
import type { Employee, Question, DailyAnswer } from "./supabase";

/**
 * Generate an Excel export matching the exact column layout from Book1.xlsx:
 * Emp Code | Emp Name | [Category] Plan | [Category] Ach | ...
 * One Plan/Ach column pair per active question, in sort_order.
 */
export function generateExcel(
  employees: Employee[],
  questions: Question[],
  answers: DailyAnswer[],
  dateRange: { start: string; end: string }
) {
  const sortedQuestions = [...questions].sort((a, b) => a.sort_order - b.sort_order);

  // Build header rows
  // Row 1: Emp Code, Emp Name, then category names spanning 2 columns each
  const headerRow1: string[] = ["Emp Code", "Emp Name"];
  for (const q of sortedQuestions) {
    headerRow1.push(q.label, "");
  }

  // Row 2: blank under Emp Code/Emp Name, then Plan/Ach pairs
  const headerRow2: string[] = ["", ""];
  for (const _q of sortedQuestions) {
    headerRow2.push("Plan", "Ach");
  }

  // Build a lookup: employeeId+questionId+date+phase → value
  const answerMap = new Map<string, number>();
  for (const a of answers) {
    const key = `${a.employee_id}|${a.question_id}|${a.answer_date}|${a.phase}`;
    answerMap.set(key, a.value);
  }

  // Get unique dates in range
  const dates = new Set<string>();
  for (const a of answers) {
    dates.add(a.answer_date);
  }
  const sortedDates = [...dates].sort();

  // If no dates found in answers, create a single-day export for the start date
  if (sortedDates.length === 0) {
    sortedDates.push(dateRange.start);
  }

  const allRows: (string | number)[][] = [];

  for (const date of sortedDates) {
    // Add a date separator row
    allRows.push([`Date: ${date}`]);
    allRows.push(headerRow1);
    allRows.push(headerRow2);

    // Active employees only
    const activeEmployees = employees.filter((e) => e.active);

    for (const emp of activeEmployees) {
      const row: (string | number)[] = [emp.emp_code, emp.name];

      for (const q of sortedQuestions) {
        const planKey = `${emp.id}|${q.id}|${date}|plan`;
        const achKey = `${emp.id}|${q.id}|${date}|ach`;
        row.push(answerMap.get(planKey) ?? 0);
        row.push(answerMap.get(achKey) ?? 0);
      }

      allRows.push(row);
    }

    // Add empty row between dates
    allRows.push([]);
  }

  // Create workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Set column widths
  const colWidths: XLSX.ColInfo[] = [
    { wch: 12 }, // Emp Code
    { wch: 20 }, // Emp Name
  ];
  for (const _q of sortedQuestions) {
    colWidths.push({ wch: 8 }); // Plan
    colWidths.push({ wch: 8 }); // Ach
  }
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, "Daily Report");

  // Generate and download
  const fileName = `sales_report_${dateRange.start}_to_${dateRange.end}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Generate a single-date Excel export (simplified version for quick downloads).
 */
export function generateSingleDateExcel(
  employees: Employee[],
  questions: Question[],
  answers: DailyAnswer[],
  date: string
) {
  const sortedQuestions = [...questions].sort((a, b) => a.sort_order - b.sort_order);

  // Build header rows matching Book1.xlsx exactly
  const headerRow1: string[] = ["Emp Code", "Emp Name"];
  for (const q of sortedQuestions) {
    headerRow1.push(q.label, "");
  }

  const headerRow2: string[] = ["", ""];
  for (const _q of sortedQuestions) {
    headerRow2.push("Plan", "Ach");
  }

  // Build answer lookup
  const answerMap = new Map<string, number>();
  for (const a of answers) {
    const key = `${a.employee_id}|${a.question_id}|${a.phase}`;
    answerMap.set(key, a.value);
  }

  const dataRows: (string | number)[][] = [];
  const activeEmployees = employees.filter((e) => e.active);

  for (const emp of activeEmployees) {
    const row: (string | number)[] = [emp.emp_code, emp.name];
    for (const q of sortedQuestions) {
      row.push(answerMap.get(`${emp.id}|${q.id}|plan`) ?? 0);
      row.push(answerMap.get(`${emp.id}|${q.id}|ach`) ?? 0);
    }
    dataRows.push(row);
  }

  const allRows = [headerRow1, headerRow2, ...dataRows];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  ws["!cols"] = [
    { wch: 12 },
    { wch: 20 },
    ...sortedQuestions.flatMap(() => [{ wch: 8 }, { wch: 8 }]),
  ];

  // Merge header cells for category names (span 2 columns each)
  const merges: XLSX.Range[] = [];
  for (let i = 0; i < sortedQuestions.length; i++) {
    merges.push({
      s: { r: 0, c: 2 + i * 2 },
      e: { r: 0, c: 3 + i * 2 },
    });
  }
  ws["!merges"] = merges;

  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, `sales_report_${date}.xlsx`);
}
