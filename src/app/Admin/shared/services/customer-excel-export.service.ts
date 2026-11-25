import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Customer } from '../models/customer.model';

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Injectable({ providedIn: 'root' })
export class CustomerExcelExportService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  download(customers: Customer[], dateFrom = '', dateTo = ''): void {
    if (!isPlatformBrowser(this.platformId) || customers.length === 0) return;

    const workbook = this.createWorkbook(customers);
    const blobBytes = new Uint8Array(workbook.length);
    blobBytes.set(workbook);
    const blob = new Blob([blobBytes.buffer], { type: XLSX_MIME_TYPE });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = this.fileName(dateFrom, dateTo);
    anchor.style.display = 'none';
    this.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    this.document.defaultView?.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  }

  private createWorkbook(customers: Customer[]): Uint8Array {
    const rows = [
      ['Account number', 'Status', 'Added date'],
      ...customers.map((customer) => [
        customer.accountNumber,
        customer.isActive ? 'Active' : 'Inactive',
        customer.createdAt.slice(0, 10),
      ]),
    ];
    const sheetRows = rows.map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row.map((value, columnIndex) =>
        this.inlineStringCell(`${this.columnName(columnIndex + 1)}${rowNumber}`, value),
      ).join('');
      return `<row r="${rowNumber}">${cells}</row>`;
    }).join('');

    const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<dimension ref="A1:C${rows.length}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
      `<sheetFormatPr defaultRowHeight="19"/><cols>` +
      `<col min="1" max="1" width="26" customWidth="1"/>` +
      `<col min="2" max="2" width="16" customWidth="1"/>` +
      `<col min="3" max="3" width="18" customWidth="1"/>` +
      `</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:C${rows.length}"/></worksheet>`;

    return this.createZip([
      {
        name: '[Content_Types].xml',
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `</Types>`,
      },
      {
        name: '_rels/.rels',
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`,
      },
      {
        name: 'xl/workbook.xml',
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
          `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets><sheet name="Customers" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      },
      {
        name: 'xl/_rels/workbook.xml.rels',
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
          `</Relationships>`,
      },
      { name: 'xl/worksheets/sheet1.xml', content: worksheet },
    ]);
  }

  private inlineStringCell(reference: string, value: string): string {
    return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${this.escapeXml(value)}</t></is></c>`;
  }

  private escapeXml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    })[character] ?? character);
  }

  private columnName(column: number): string {
    let result = '';
    let current = column;
    while (current > 0) {
      const remainder = (current - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      current = Math.floor((current - 1) / 26);
    }
    return result;
  }

  private createZip(files: Array<{ name: string; content: string }>): Uint8Array {
    const encoder = new TextEncoder();
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    const dateTime = this.dosDateTime(new Date());
    let localOffset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const contentBytes = encoder.encode(file.content);
      const crc = this.crc32(contentBytes);
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, dateTime.time, true);
      localView.setUint16(12, dateTime.date, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, contentBytes.length, true);
      localView.setUint32(22, contentBytes.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);
      localParts.push(localHeader, contentBytes);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, dateTime.time, true);
      centralView.setUint16(14, dateTime.date, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, contentBytes.length, true);
      centralView.setUint32(24, contentBytes.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, localOffset, true);
      centralHeader.set(nameBytes, 46);
      centralParts.push(centralHeader);
      localOffset += localHeader.length + contentBytes.length;
    }

    const centralDirectory = this.joinBytes(centralParts);
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralDirectory.length, true);
    endView.setUint32(16, localOffset, true);
    endView.setUint16(20, 0, true);

    return this.joinBytes([...localParts, centralDirectory, endRecord]);
  }

  private joinBytes(parts: Uint8Array[]): Uint8Array {
    const totalLength = parts.reduce((total, part) => total + part.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }

  private crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  private dosDateTime(date: Date): { date: number; time: number } {
    const year = Math.max(1980, date.getFullYear());
    return {
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    };
  }

  private fileName(dateFrom: string, dateTo: string): string {
    const suffix = dateFrom || dateTo
      ? `${dateFrom || 'start'}-to-${dateTo || 'today'}`
      : new Date().toISOString().slice(0, 10);
    return `prepaid-customers-${suffix}.xlsx`;
  }
}
