import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {EmployeeRecord, PayrollRecord} from '../types/hrms';

let cachedLogo: {dataUrl: string; aspect: number} | null = null;

if (typeof window !== 'undefined') {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 400;
      canvas.height = img.naturalHeight || 120;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        cachedLogo = {
          dataUrl: canvas.toDataURL('image/png'),
          aspect: canvas.width / Math.max(1, canvas.height),
        };
      }
    } catch {
      cachedLogo = null;
    }
  };
  img.src = '/assets/aistudio/logo_33dbe725.png';
}

export function exportToCsv(filename: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]): void {
  const escape = (val: string | number | boolean | null | undefined) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  // UTF-8 BOM for clean Excel opening
  const blob = new Blob(['\uFEFF' + csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportReportToPdf(
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string,
): void {
  const doc = new jsPDF({orientation: headers.length > 6 ? 'landscape' : 'portrait'});
  doc.setFillColor(11, 27, 54);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 26, 'F');
  let textX = 14;
  if (cachedLogo) {
    const logoH = 12;
    const logoW = Math.min(44, logoH * cachedLogo.aspect);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(12, 7, logoW + 4, logoH + 2, 1.5, 1.5, 'F');
    doc.addImage(cachedLogo.dataUrl, 'PNG', 14, 8, logoW, logoH);
    textX = 18 + logoW + 4;
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text('IDEAL INDUSTRIAL SYNERGY SOLUTIONS PRIVATE LIMITED', textX, 11);
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(`${title} — ${subtitle}`, textX, 19);

  autoTable(doc, {
    startY: 32,
    head: [headers],
    body: rows,
    styles: {fontSize: 8, cellPadding: 2.5},
    headStyles: {fillColor: [19, 41, 75], textColor: 255},
    alternateRowStyles: {fillColor: [248, 250, 252]},
  });

  doc.save(filename);
}

export function generatePayslipPdf(payroll: PayrollRecord, employee?: EmployeeRecord): void {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(11, 27, 54);
  doc.rect(0, 0, pageW, 34, 'F');
  let textX = 14;
  if (cachedLogo) {
    const logoH = 14;
    const logoW = Math.min(48, logoH * cachedLogo.aspect);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(12, 9, logoW + 4, logoH + 2, 1.5, 1.5, 'F');
    doc.addImage(cachedLogo.dataUrl, 'PNG', 14, 10, logoW, logoH);
    textX = 18 + logoW + 4;
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12.5);
  doc.text('IDEAL INDUSTRIAL SYNERGY SOLUTIONS PVT. LTD.', textX, 14);
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`SALARY PAYSLIP FOR ${payroll.month}`, textX, 23);
  doc.text(`Payslip ID: ${payroll.payrollId}`, pageW - 14, 29, {align: 'right'});

  doc.setTextColor(15, 23, 42);
  autoTable(doc, {
    startY: 40,
    theme: 'grid',
    styles: {fontSize: 9, cellPadding: 3},
    body: [
      ['Employee Name', payroll.employeeName, 'Employee ID', payroll.employeeId],
      ['Department', payroll.department, 'Designation', payroll.designation],
      ['PAN Number', employee?.panNumber || 'N/A', 'Bank Account', employee?.bankAccountNumber ? `XXXX${employee.bankAccountNumber.slice(-4)}` : 'N/A'],
      ['Present Days', `${payroll.presentDays} / ${payroll.workingDaysInMonth}`, 'Paid / Unpaid Leaves', `${payroll.paidLeaveDays} / ${payroll.unpaidLeaveDays}`],
    ],
  });

  const afterMetaY = (doc as any).lastAutoTable.finalY + 8;

  autoTable(doc, {
    startY: afterMetaY,
    head: [['Earnings', 'Amount (INR)', 'Deductions', 'Amount (INR)']],
    body: [
      ['Basic Salary', payroll.basicEarned.toLocaleString('en-IN'), 'Provident Fund (PF)', payroll.pfDeduction.toLocaleString('en-IN')],
      ['House Rent Allowance (HRA)', payroll.hraEarned.toLocaleString('en-IN'), 'ESI Contribution', payroll.esiDeduction.toLocaleString('en-IN')],
      ['Conveyance & Special Allowances', payroll.allowancesEarned.toLocaleString('en-IN'), 'Professional Tax (PT)', payroll.professionalTax.toLocaleString('en-IN')],
      ['Overtime Pay', payroll.overtimePay.toLocaleString('en-IN'), 'Income Tax (TDS)', payroll.tdsDeduction.toLocaleString('en-IN')],
      ['Incentives / Bonus', payroll.incentives.toLocaleString('en-IN'), 'Unpaid Leave / Other Ded.', (payroll.unpaidDeduction + payroll.otherDeductions).toLocaleString('en-IN')],
      ['Gross Earnings', `INR ${payroll.grossEarnings.toLocaleString('en-IN')}`, 'Total Deductions', `INR ${payroll.totalDeductions.toLocaleString('en-IN')}`],
    ],
    headStyles: {fillColor: [11, 27, 54], textColor: 255},
    styles: {fontSize: 9, cellPadding: 3},
    columnStyles: {1: {halign: 'right'}, 3: {halign: 'right'}},
  });

  const netY = (doc as any).lastAutoTable.finalY + 12;
  doc.setFillColor(241, 245, 249);
  doc.rect(14, netY, pageW - 28, 18, 'F');
  doc.setFontSize(12);
  doc.setTextColor(11, 27, 54);
  doc.text(`NET PAYABLE: INR ${payroll.netPayable.toLocaleString('en-IN')}`, 20, netY + 11.5);
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Status: ${payroll.status}`, pageW - 20, netY + 11.5, {align: 'right'});

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('This is a computer-generated salary statement from IDEAL HRMS and does not require a physical signature.', 14, netY + 30);

  doc.save(`Payslip_${payroll.employeeId}_${payroll.month}.pdf`);
}
