import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/supabase/server';

/** Quote a CSV field, and neutralise spreadsheet formulas (=, +, -, @) that came from user-entered text. */
function csv(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Xero "Sales Invoice" import template. A leading * marks the columns Xero requires.
const HEADERS = [
  '*ContactName', 'EmailAddress', '*InvoiceNumber', 'Reference', '*InvoiceDate', '*DueDate',
  'InventoryItemCode', '*Description', '*Quantity', '*UnitAmount', '*AccountCode', '*TaxType', 'Currency',
];

/**
 * GET /api/invoices/export?ids=<uuid>,<uuid>
 * Returns a CSV for Xero > Business > Invoices > Import and marks those invoices as exported.
 * Only approved, sent or paid invoices are included. The query runs as the caller, so row level
 * security still applies, and only office staff may export.
 */
export async function GET(request: NextRequest) {
  const ctx = await getRequestContext(request);
  if (!ctx || !['admin', 'manager', 'office'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ids = (request.nextUrl.searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
    return NextResponse.json({ error: 'Invalid invoice id' }, { status: 400 });
  }

  let q = ctx.db.from('xero_invoice_export').select('*');
  if (ids.length) q = q.in('invoice_id', ids);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) {
    return NextResponse.json({ error: 'No approved invoices to export. Approve the invoices first.' }, { status: 404 });
  }

  const lines = [HEADERS.join(',')];
  for (const r of data) {
    lines.push(
      [
        r.contact_name, r.email_address, r.invoice_number, r.reference, r.invoice_date, r.due_date,
        r.inventory_item_code, r.description, r.quantity, r.unit_amount, r.account_code, r.tax_type, r.currency,
      ].map(csv).join(',')
    );
  }

  const exportedIds = [...new Set(data.map((r: any) => r.invoice_id as string))];
  await ctx.db.rpc('mark_invoices_exported', { p_ids: exportedIds });

  return new NextResponse(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="carehub-xero-invoices-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
