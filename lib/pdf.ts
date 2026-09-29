import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ReceiptPdfData = {
  receiptNumber: string;
  issuedAt: string;
  tenantName: string;
  buildingName: string;
  unitNumber: string;
  amount: string;
  method: string;
  transactionRef?: string | null;
  period?: string;
};

export type ReportPdfData = {
  title: string;
  period: string;
  rows: Array<[string, string]>;
};

export type LeaseContractPdfData = {
  contractNumber: string;
  issuedAt: string;
  tenantName: string;
  tenantPhone?: string | null;
  buildingName: string;
  buildingAddress: string;
  buildingCity?: string | null;
  unitNumber: string;
  floor?: number | null;
  bedrooms: number;
  areaSqm?: number | null;
  rentAmount: string;
  depositAmount: string;
  startDate: string;
  endDate?: string | null;
};

function safeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u202f|\u00a0/g, " ").replace(/[^\x20-\x7E]/g, "?");
}

function drawLines(page: ReturnType<PDFDocument["addPage"]>, lines: string[], font: Awaited<ReturnType<PDFDocument["embedFont"]>>, size: number, x: number, startY: number, gap: number) {
  let y = startY;
  for (const line of lines) {
    page.drawText(safeText(line), { x, y, size, font, color: rgb(0.12, 0.24, 0.21) });
    y -= gap;
  }
  return y;
}

export async function createReceiptPdf(data: ReceiptPdfData) {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.07, 0.24, 0.21);
  const muted = rgb(0.36, 0.45, 0.42);

  page.drawRectangle({ x: 0, y: 742, width: 595, height: 100, color: green });
  page.drawText("NAYA", { x: 48, y: 796, size: 24, font: bold, color: rgb(0.79, 0.94, 0.42) });
  page.drawText("RECU DE LOYER", { x: 48, y: 766, size: 12, font: regular, color: rgb(0.88, 0.95, 0.91) });
  page.drawText(data.receiptNumber, { x: 420, y: 780, size: 11, font: regular, color: rgb(1, 1, 1) });

  let y = 680;
  y = drawLines(page, [
    `Date: ${data.issuedAt}`,
    `Locataire: ${data.tenantName}`,
    `Immeuble: ${data.buildingName}`,
    `Unite: ${data.unitNumber}`,
    data.period ? `Periode: ${data.period}` : "",
  ].filter(Boolean), regular, 11, 48, y, 22);
  page.drawLine({ start: { x: 48, y: y - 18 }, end: { x: 547, y: y - 18 }, thickness: 1, color: rgb(0.84, 0.88, 0.85) });
  page.drawText("MONTANT RECU", { x: 48, y: y - 65, size: 10, font: bold, color: muted });
  page.drawText(safeText(data.amount), { x: 48, y: y - 102, size: 25, font: bold, color: green });
  y -= 155;
  drawLines(page, [
    `Moyen de paiement: ${data.method}`,
    data.transactionRef ? `Reference: ${data.transactionRef}` : "",
  ].filter(Boolean), regular, 10, 48, y, 20);

  page.drawText("Merci de conserver ce document.", { x: 48, y: 90, size: 10, font: regular, color: muted });
  page.drawText("Naya - Gestion locative", { x: 400, y: 90, size: 9, font: regular, color: muted });
  return document.save();
}

export async function createLeaseContractPdf(data: LeaseContractPdfData) {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const italic = await document.embedFont(StandardFonts.HelveticaOblique);
  const green = rgb(0.07, 0.24, 0.21);
  const muted = rgb(0.36, 0.45, 0.42);

  page.drawRectangle({ x: 0, y: 742, width: 595, height: 100, color: green });
  page.drawText("NAYA", { x: 48, y: 796, size: 24, font: bold, color: rgb(0.79, 0.94, 0.42) });
  page.drawText("CONTRAT DE LOCATION", { x: 48, y: 766, size: 12, font: regular, color: rgb(0.88, 0.95, 0.91) });
  page.drawText(data.contractNumber, { x: 420, y: 780, size: 11, font: regular, color: rgb(1, 1, 1) });
  page.drawText(data.issuedAt, { x: 420, y: 762, size: 9, font: regular, color: rgb(0.9, 0.95, 0.93) });

  let y = 686;
  page.drawText("ENTRE LES SOUSSIGNES", { x: 48, y, size: 10, font: bold, color: muted });
  y -= 24;
  y = drawLines(page, [
    `Le Proprietaire / Gerant: ${data.buildingName}`,
    `Immeuble: ${data.buildingAddress}${data.buildingCity ? `, ${data.buildingCity}` : ""}`,
    "Ci-apres designe le bailleur,",
  ].filter(Boolean), regular, 11, 48, y, 20);
  y -= 16;
  page.drawText("D'UNE PART", { x: 48, y, size: 9, font: italic, color: muted });
  y -= 34;
  page.drawText("ET", { x: 48, y, size: 10, font: bold, color: green });
  y -= 26;
  drawLines(page, [
    `Le Locataire: ${data.tenantName}${data.tenantPhone ? ` (${data.tenantPhone})` : ""}`,
    "Ci-apres designe le locataire,",
  ].filter(Boolean), regular, 11, 48, y, 20);
  y -= 16;
  page.drawText("D'AUTRE PART", { x: 48, y, size: 9, font: italic, color: muted });
  y -= 40;

  page.drawText("OBJET DU CONTRAT", { x: 48, y, size: 10, font: bold, color: muted });
  y -= 24;
  y = drawLines(page, [
    `Le bailleur donne a bail au locataire l'unite ${data.unitNumber}${data.floor != null ? ` (etage ${data.floor})` : ""}, ${data.bedrooms} piece(s)${data.areaSqm ? `, ${data.areaSqm} m2` : ""},`,
    `au sein de l'immeuble ${data.buildingName}, pour une duree determinee.`,
  ].filter(Boolean), regular, 11, 48, y, 20);
  y -= 16;

  y = drawLines(page, [
    `Debut du bail: ${data.startDate}`,
    data.endDate ? `Fin du bail: ${data.endDate}` : "Duree indeterminee",
    `Loyer mensuel: ${data.rentAmount}`,
    `Depot de garantie: ${data.depositAmount}`,
  ].filter(Boolean), regular, 11, 48, y, 20);
  y -= 16;

  page.drawText("CONDITIONS GENERALES", { x: 48, y, size: 10, font: bold, color: muted });
  y -= 24;
  const clauses = [
    "1. Le loyer est payable d'avance chaque mois, par tout moyen accepte par le bailleur.",
    "2. Les charges communes (eau, electricite, securite) sont reparties entre les locataires et",
    "   facturees selon le mode prevu au bail.",
    "3. Le locataire s'engage a entretenir le logement et a signaler tout incident au bailleur.",
    "4. Le depot de garantie est restitue a la fin du bail, deduction faite des sommes dues.",
    "5. Tout incident ou sinistre doit etre declare sans delai au gerant de l'immeuble.",
    "6. Le present contrat est regit par la legislation locale en vigueur.",
  ];
  for (const clause of clauses) {
    page.drawText(safeText(clause), { x: 48, y, size: 9.5, font: regular, color: rgb(0.18, 0.28, 0.24) });
    y -= 16;
  }
  y -= 30;

  page.drawText("Fait en deux exemplaires originaux.", { x: 48, y, size: 10, font: italic, color: muted });
  y -= 24;
  drawLines(page, [
    "Signature du bailleur: ______________________",
    "",
    "Signature du locataire: ______________________",
  ], regular, 10, 48, y, 22);

  page.drawText("Document genere automatiquement par Naya.", { x: 48, y: 80, size: 9, font: regular, color: muted });
  page.drawText("Naya - Gestion locative", { x: 400, y: 80, size: 9, font: regular, color: muted });
  return document.save();
}

export async function createReportPdf(data: ReportPdfData) {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.07, 0.24, 0.21);
  page.drawRectangle({ x: 0, y: 742, width: 595, height: 100, color: green });
  page.drawText("NAYA", { x: 48, y: 796, size: 24, font: bold, color: rgb(0.79, 0.94, 0.42) });
  page.drawText(safeText(data.title), { x: 48, y: 766, size: 13, font: regular, color: rgb(0.88, 0.95, 0.91) });
  page.drawText(data.period, { x: 430, y: 780, size: 10, font: regular, color: rgb(1, 1, 1) });
  let y = 680;
  for (const [label, value] of data.rows) {
    page.drawText(safeText(label), { x: 48, y, size: 11, font: regular, color: rgb(0.3, 0.4, 0.36) });
    page.drawText(safeText(value), { x: 390, y, size: 11, font: bold, color: green });
    page.drawLine({ start: { x: 48, y: y - 10 }, end: { x: 547, y: y - 10 }, thickness: 0.5, color: rgb(0.87, 0.9, 0.88) });
    y -= 34;
  }
  return document.save();
}
