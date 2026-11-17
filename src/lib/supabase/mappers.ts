import type {
  Client, Caregiver, Shift, IncidentReport, ShiftNote, Notification,
  TimeOffRequest, Location, Message, Expense, Mileage, CarePlan,
  Assessment, Billing, Payroll, Form, CostCode, WallPost,
  NewExpense, PayrollSettings, PayPeriod, Timesheet, TimesheetAdjustment,
  TimesheetTotal, SupportCategory, ParticipantPlan, PlanBudget, BudgetSummary, BudgetAdjustment
} from '@/lib/types';

export type LatLng = { latitude: number; longitude: number };

/** (0,0) is the placeholder for "no location"; it is never written back. */
export function hasPoint(p?: LatLng | null): p is LatLng {
  return !!p && !(p.latitude === 0 && p.longitude === 0);
}

/** Read a lat/lng column pair; undefined when either is NULL. */
export function readPoint(lat: unknown, lng: unknown): LatLng | undefined {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return undefined;
  const la = Number(lat);
  const lo = Number(lng);
  return Number.isFinite(la) && Number.isFinite(lo) ? { latitude: la, longitude: lo } : undefined;
}

/** Required text: empty string fallback, use for NOT NULL columns. */
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * Nullable text: preserves SQL NULL as undefined.
 *
 * Mapping null to '' is lossy, because toXRow() writes back any value that is
 * not undefined, so a read-modify-write would turn a NULL column into an
 * empty string permanently. It also breaks unique columns, where two rows
 * with NULL email would collapse to the same ''.
 */
const optStr = (v: unknown) =>
  v === null || v === undefined ? undefined : String(v);

const num = (v: unknown, d = 0) => (v === null || v === undefined ? d : Number(v));
const numOrUndef = (v: unknown) =>
  v === null || v === undefined ? undefined : Number(v);
const dateOrUndef = (v: unknown) => {
  if (v === null || v === undefined || v === '') return undefined;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export function mapClient(r: any): Client {
  const firstName = str(r.first_name);
  const lastName = str(r.last_name);
  return {
    id: str(r.id)!,
    firstName,
    lastName,
    fullName: `${firstName ?? ''} ${lastName ?? ''}`.trim(),
    email: str(r.email),
    dateOfBirth: str(r.date_of_birth)?.split('T')[0],
    diagnosis: str(r.diagnosis),
    allergies: Array.isArray(r.allergies) ? r.allergies : [],
    carePlan: str(r.care_plan),
    notes: str(r.notes),
    emergencyContact: str(r.emergency_contact),
    location: readPoint(r.lat, r.lng) ?? { latitude: 0, longitude: 0 },
    address: str(r.address),
    phone: optStr(r.phone),
    ndisNumber: optStr(r.ndis_number),
    siteId: optStr(r.site_id),
    priceRegion: r.price_region ?? 'national',
    state: optStr(r.state),
    geofenceRadiusM: numOrUndef(r.geofence_radius_m),
    // Standing support team comes from the client_caregivers join when it was selected.
    assignedCaregivers: Array.isArray(r.client_caregivers)
      ? r.client_caregivers.filter((c: any) => !c.unassigned_at).map((c: any) => c.caregiver_id)
      : [],
    preferredCaregivers: [],
    profilePictureUrl: str(r.profile_picture_url),
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
    status: str(r.status) || 'active',
  };
}

export function toClientRow(d: Partial<Client>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.firstName !== undefined) row.first_name = d.firstName;
  if (d.lastName !== undefined) row.last_name = d.lastName;
  if (d.email !== undefined) row.email = d.email;
  if (d.dateOfBirth !== undefined) row.date_of_birth = d.dateOfBirth || null;
  if (d.diagnosis !== undefined) row.diagnosis = d.diagnosis;
  if (d.allergies !== undefined) row.allergies = d.allergies;
  if (d.carePlan !== undefined) row.care_plan = d.carePlan;
  if (d.notes !== undefined) row.notes = d.notes;
  if (d.emergencyContact !== undefined) row.emergency_contact = d.emergencyContact;
  if (d.location !== undefined && hasPoint(d.location)) {
    row.lat = d.location.latitude;
    row.lng = d.location.longitude;
  }
  if (d.address !== undefined) row.address = d.address;
  if (d.phone !== undefined) row.phone = d.phone || null;
  if (d.ndisNumber !== undefined) row.ndis_number = d.ndisNumber || null;
  if (d.siteId !== undefined) row.site_id = d.siteId || null;
  if (d.priceRegion !== undefined) row.price_region = d.priceRegion;
  if (d.state !== undefined) row.state = d.state || null;
  if (d.geofenceRadiusM !== undefined) row.geofence_radius_m = d.geofenceRadiusM || null;
  if (d.profilePictureUrl !== undefined) row.profile_picture_url = d.profilePictureUrl;
  if (d.status !== undefined) row.status = d.status;
  return row;
}

export function mapCaregiver(r: any): Caregiver {
  return {
    id: str(r.id)!,
    name: str(r.name),
    email: str(r.email),
    phone: str(r.phone),
    userId: optStr(r.user_id),
    workerLevel: r.worker_level ?? 'level_2',
    qualifications: Array.isArray(r.qualifications) ? r.qualifications : [],
    experience: num(r.experience),
    skills: Array.isArray(r.skills) ? r.skills : [],
    availability: r.availability ?? 'Available',
    profilePictureUrl: r.profile_picture_url ?? undefined,
    fcmToken: r.push_token ?? undefined,
    contractStatus: r.contract_status ?? 'Active',
    currentShiftId: r.current_shift_id ?? undefined,
    evvCompliance: r.evv_compliance ?? 'Unknown',
    clientsWorkedWith: Array.isArray(r.clients_worked_with) ? r.clients_worked_with : [],
    clientsInductedFor: Array.isArray(r.clients_inducted_for) ? r.clients_inducted_for : [],
  };
}

export function toCaregiverRow(d: Partial<Caregiver>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.name !== undefined) row.name = d.name;
  if (d.email !== undefined) row.email = d.email;
  if (d.phone !== undefined) row.phone = d.phone;
  if (d.workerLevel !== undefined) row.worker_level = d.workerLevel;
  if (d.qualifications !== undefined) row.qualifications = d.qualifications;
  if (d.experience !== undefined) row.experience = d.experience;
  if (d.skills !== undefined) row.skills = d.skills;
  if (d.availability !== undefined) row.availability = d.availability;
  if (d.profilePictureUrl !== undefined) row.profile_picture_url = d.profilePictureUrl;
  if (d.fcmToken !== undefined) row.push_token = d.fcmToken;
  if (d.contractStatus !== undefined) row.contract_status = d.contractStatus;
  if (d.currentShiftId !== undefined) row.current_shift_id = d.currentShiftId;
  if (d.evvCompliance !== undefined) row.evv_compliance = d.evvCompliance;
  if (d.clientsWorkedWith !== undefined) row.clients_worked_with = d.clientsWorkedWith;
  if (d.clientsInductedFor !== undefined) row.clients_inducted_for = d.clientsInductedFor;
  return row;
}

export function mapShift(r: any, clients: Client[] = [], caregivers: Caregiver[] = []): Shift {
  const client = clients.find((c) => c.id === r.client_id);
  const caregiver = caregivers.find((c) => c.id === r.caregiver_id);
  return {
    id: str(r.id)!,
    shiftId: str(r.id)!,
    clientId: str(r.client_id)!,
    caregiverId: r.caregiver_id ?? null,
    serviceType: r.service_type,
    date: str(r.date)?.split('T')[0] ?? '',
    startTime: r.start_time,
    endTime: r.end_time,
    status: r.status,
    siteId: optStr(r.site_id),
    seriesId: optStr(r.series_id),
    splitFrom: optStr(r.split_from),
    itemNumber: optStr(r.item_number),
    ratio: r.ratio ?? '1:1',
    requiredWorkers: num(r.required_workers, 1),
    geofenceRequired:
      r.geofence_required === null || r.geofence_required === undefined ? undefined : !!r.geofence_required,
    pricingWarning: optStr(r.pricing_warning),
    notes: optStr(r.notes),
    approvalStatus: r.approval_status ?? 'pending',
    approvedAt: dateOrUndef(r.approved_at),
    rejectReason: optStr(r.reject_reason),
    cancelPay: !!r.cancel_pay,
    cancelReason: optStr(r.cancel_reason),
    shiftPublishState: r.shift_publish_state ?? undefined,
    // Present when the query embeds shift_workers / shift_clients.
    workerIds: Array.isArray(r.shift_workers) ? r.shift_workers.map((w: any) => w.caregiver_id) : undefined,
    clientIds: Array.isArray(r.shift_clients) ? r.shift_clients.map((c: any) => c.client_id) : undefined,
    clockInTime: dateOrUndef(r.clock_in_time),
    clockOutTime: dateOrUndef(r.clock_out_time),
    // An uncompleted shift has NULL hours_worked; mapping that to 0 would
    // make payroll treat a pending visit as zero hours rather than unknown.
    hoursWorked: numOrUndef(r.hours_worked),
    createdBy: str(r.created_by) ?? '',
    createdAt: new Date(r.created_at),
    modifiedBy: str(r.modified_by),
    modifiedAt: dateOrUndef(r.modified_at),
    allowOverlap: !!r.allow_overlap,
    deleted: !!r.deleted,
    supportFamily: r.support_family ?? undefined,
    isSleepover: !!r.is_sleepover,
    clientName: client ? client.fullName : 'Unknown Client',
    caregiverName: caregiver ? caregiver.name : 'Unknown Caregiver',
  };
}

export function toShiftRow(d: Partial<Shift>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.clientId !== undefined) row.client_id = d.clientId;
  if (d.caregiverId !== undefined) row.caregiver_id = d.caregiverId || null;
  if (d.serviceType !== undefined) row.service_type = d.serviceType;
  if (d.date !== undefined) row.date = d.date;
  if (d.startTime !== undefined) row.start_time = d.startTime;
  if (d.endTime !== undefined) row.end_time = d.endTime;
  // status, clock times and hours are derived by the database from shift_workers.
  if (d.siteId !== undefined) row.site_id = d.siteId || null;
  if (d.itemNumber !== undefined) row.item_number = d.itemNumber || null;
  if (d.ratio !== undefined) row.ratio = d.ratio;
  if (d.requiredWorkers !== undefined) row.required_workers = d.requiredWorkers;
  if (d.geofenceRequired !== undefined) row.geofence_required = d.geofenceRequired;
  if (d.notes !== undefined) row.notes = d.notes || null;
  if (d.createdBy !== undefined) row.created_by = d.createdBy;
  if (d.modifiedBy !== undefined) row.modified_by = d.modifiedBy;
  if (d.allowOverlap !== undefined) row.allow_overlap = d.allowOverlap;
  if (d.deleted !== undefined) row.deleted = d.deleted;
  if (d.supportFamily !== undefined) row.support_family = d.supportFamily || null;
  if (d.isSleepover !== undefined) row.is_sleepover = d.isSleepover;
  return row;
}

export function mapIncident(r: any): IncidentReport {
  return {
    id: str(r.id)!,
    shiftId: r.shift_id ?? undefined,
    clientId: r.client_id ?? undefined,
    caregiverId: str(r.caregiver_id)!,
    date: str(r.date).split('T')[0],
    time: str(r.time),
    description: str(r.description),
    incidentType: str(r.incident_type),
    status: r.status ?? 'Reported',
    actionsTaken: r.actions_taken ?? undefined,
    involvedParties: r.involved_parties ?? undefined,
    photoUrls: Array.isArray(r.photo_urls) ? r.photo_urls : [],
    name: r.client_name ?? undefined,
    severity: r.severity ?? undefined,
  };
}

export function toIncidentRow(d: Partial<IncidentReport>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.shiftId !== undefined) row.shift_id = d.shiftId || null;
  if (d.clientId !== undefined) row.client_id = d.clientId || null;
  if (d.caregiverId !== undefined) row.caregiver_id = d.caregiverId;
  if (d.date !== undefined) row.date = d.date;
  if (d.time !== undefined) row.time = d.time || null;
  if (d.description !== undefined) row.description = d.description;
  if (d.incidentType !== undefined) row.incident_type = d.incidentType;
  if (d.status !== undefined) row.status = d.status;
  if (d.actionsTaken !== undefined) row.actions_taken = d.actionsTaken;
  if (d.involvedParties !== undefined) row.involved_parties = d.involvedParties;
  if (d.photoUrls !== undefined) row.photo_urls = d.photoUrls;
  if (d.severity !== undefined) row.severity = d.severity || null;
  return row;
}

export function mapShiftNote(r: any): ShiftNote {
  return {
    id: str(r.id)!,
    shiftId: r.shift_id ?? undefined,
    caregiverId: str(r.caregiver_id)!,
    clientId: str(r.client_id)!,
    note: str(r.note),
    category: r.category ?? 'general',
    followUp: !!r.follow_up,
    timestamp: new Date(r.timestamp),
    status: r.status ?? 'Open',
  };
}

export function toShiftNoteRow(d: Partial<ShiftNote>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.shiftId !== undefined) row.shift_id = d.shiftId || null;
  if (d.caregiverId !== undefined) row.caregiver_id = d.caregiverId;
  if (d.clientId !== undefined) row.client_id = d.clientId;
  if (d.category !== undefined) row.category = d.category;
  if (d.followUp !== undefined) row.follow_up = d.followUp;
  if (d.note !== undefined) row.note = d.note;
  if (d.timestamp !== undefined) row.timestamp = d.timestamp;
  if (d.status !== undefined) row.status = d.status;
  return row;
}

export function mapNotification(r: any): Notification {
  return {
    id: str(r.id)!,
    title: str(r.title),
    message: str(r.message),
    type: r.type,
    timestamp: new Date(r.timestamp),
    read: !!r.read,
    data: r.data ?? {},
  };
}

export function mapTimeOffRequest(r: any): TimeOffRequest {
  return {
    id: str(r.id)!,
    caregiverId: str(r.caregiver_id)!,
    startDate: str(r.start_date).split('T')[0],
    endDate: str(r.end_date).split('T')[0],
    reason: str(r.reason),
    status: r.status ?? 'Pending',
    requestedAt: new Date(r.requested_at),
    approvedAt: r.approved_at ? new Date(r.approved_at) : undefined,
    approvedBy: r.approved_by ?? undefined,
  };
}

export function toTimeOffRequestRow(d: Partial<TimeOffRequest>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.caregiverId !== undefined) row.caregiver_id = d.caregiverId;
  if (d.startDate !== undefined) row.start_date = d.startDate || null;
  if (d.endDate !== undefined) row.end_date = d.endDate || null;
  if (d.reason !== undefined) row.reason = d.reason;
  if (d.status !== undefined) row.status = d.status;
  return row;
}

export function mapLocation(r: any): Location {
  const p = readPoint(r.lat, r.lng) ?? { latitude: 0, longitude: 0 };
  return {
    id: str(r.id)!,
    caregiverId: str(r.caregiver_id)!,
    latitude: p.latitude,
    longitude: p.longitude,
    timestamp: new Date(r.timestamp),
    accuracy: r.accuracy === null || r.accuracy === undefined ? undefined : num(r.accuracy),
  };
}

export function mapMessage(r: any): Message {
  return {
    id: str(r.id)!,
    senderId: str(r.sender_id)!,
    recipientId: str(r.recipient_id)!,
    content: str(r.content),
    timestamp: new Date(r.timestamp),
    read: !!r.read,
    type: r.type ?? 'text',
    groupId: r.group_id ?? undefined,
  };
}

export function mapExpense(r: any): Expense {
  return {
    id: str(r.id)!,
    caregiverId: str(r.caregiver_id)!,
    clientId: r.client_id ?? undefined,
    shiftId: r.shift_id ?? undefined,
    category: r.category,
    description: str(r.description),
    amount: num(r.amount),
    currency: r.currency ?? 'AUD',
    date: new Date(r.date),
    receiptUrl: r.receipt_url ?? undefined,
    status: r.status ?? 'Pending',
    approvedBy: r.approved_by ?? undefined,
    approvedAt: r.approved_at ? new Date(r.approved_at) : undefined,
    createdAt: new Date(r.created_at),
    modifiedAt: r.modified_at ? new Date(r.modified_at) : undefined,
  };
}

export function toExpenseRow(d: Partial<Expense>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.caregiverId !== undefined) row.caregiver_id = d.caregiverId;
  if (d.clientId !== undefined) row.client_id = d.clientId || null;
  if (d.shiftId !== undefined) row.shift_id = d.shiftId || null;
  if (d.category !== undefined) row.category = d.category;
  if (d.description !== undefined) row.description = d.description;
  if (d.amount !== undefined) row.amount = d.amount;
  if (d.currency !== undefined) row.currency = d.currency;
  if (d.date !== undefined) row.date = d.date;
  if (d.receiptUrl !== undefined) row.receipt_url = d.receiptUrl || null;
  if (d.status !== undefined) row.status = d.status;
  if (d.approvedBy !== undefined) row.approved_by = d.approvedBy || null;
  if (d.approvedAt !== undefined) row.approved_at = d.approvedAt;
  return row;
}

export function mapMileage(r: any): Mileage {
  const none = { latitude: 0, longitude: 0 };
  return {
    id: str(r.id)!,
    caregiverId: str(r.caregiver_id)!,
    clientId: r.client_id ?? undefined,
    shiftId: r.shift_id ?? undefined,
    startLocation: { ...none, address: undefined },
    endLocation: { ...none, address: undefined },
    distance: num(r.distance),
    unit: r.unit ?? 'km',
    date: new Date(r.date),
    purpose: str(r.purpose),
    vehicleType: r.vehicle_type ?? undefined,
    createdAt: new Date(r.created_at),
    modifiedAt: r.modified_at ? new Date(r.modified_at) : undefined,
  };
}

export function toMileageRow(d: Partial<Mileage>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.caregiverId !== undefined) row.caregiver_id = d.caregiverId;
  if (d.clientId !== undefined) row.client_id = d.clientId || null;
  if (d.shiftId !== undefined) row.shift_id = d.shiftId || null;
  if (d.distance !== undefined) row.distance = d.distance;
  if (d.unit !== undefined) row.unit = d.unit;
  if (d.date !== undefined) row.date = d.date;
  if (d.purpose !== undefined) row.purpose = d.purpose;
  if (d.vehicleType !== undefined) row.vehicle_type = d.vehicleType || null;
  return row;
}

export function mapCarePlan(r: any): CarePlan {
  return {
    id: str(r.id)!,
    clientId: str(r.client_id)!,
    title: str(r.title),
    description: str(r.description),
    goals: (r.goals ?? []).map((g: any) => ({
      ...g,
      targetDate: g.targetDate ? new Date(g.targetDate) : undefined,
    })),
    tasks: (r.tasks ?? []).map((t: any) => ({ ...t })),
    startDate: new Date(r.start_date),
    endDate: r.end_date ? new Date(r.end_date) : undefined,
    status: r.status ?? 'Active',
    createdBy: str(r.created_by),
    createdAt: new Date(r.created_at),
    modifiedBy: r.modified_by ?? undefined,
    modifiedAt: r.modified_at ? new Date(r.modified_at) : undefined,
  };
}

export function toCarePlanRow(d: Partial<CarePlan>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.clientId !== undefined) row.client_id = d.clientId;
  if (d.title !== undefined) row.title = d.title;
  if (d.description !== undefined) row.description = d.description;
  if (d.goals !== undefined) {
    row.goals = d.goals.map((g) => ({ ...g, targetDate: g.targetDate?.toISOString() ?? null }));
  }
  if (d.tasks !== undefined) row.tasks = d.tasks;
  if (d.startDate !== undefined) row.start_date = d.startDate;
  if (d.endDate !== undefined) row.end_date = d.endDate || null;
  if (d.status !== undefined) row.status = d.status;
  if (d.createdBy !== undefined) row.created_by = d.createdBy;
  if (d.modifiedBy !== undefined) row.modified_by = d.modifiedBy;
  return row;
}

export function mapAssessment(r: any): Assessment {
  return {
    id: str(r.id)!,
    clientId: str(r.client_id)!,
    caregiverId: str(r.caregiver_id)!,
    type: r.type,
    date: new Date(r.date),
    results: r.results ?? [],
    overallNotes: str(r.overall_notes),
    recommendations: Array.isArray(r.recommendations) ? r.recommendations : [],
    nextAssessmentDate: r.next_assessment_date ? new Date(r.next_assessment_date) : undefined,
    status: r.status ?? 'Draft',
    reviewedBy: r.reviewed_by ?? undefined,
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at) : undefined,
    createdAt: new Date(r.created_at),
    modifiedAt: r.modified_at ? new Date(r.modified_at) : undefined,
  };
}

export function toAssessmentRow(d: Partial<Assessment>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.clientId !== undefined) row.client_id = d.clientId;
  if (d.caregiverId !== undefined) row.caregiver_id = d.caregiverId;
  if (d.type !== undefined) row.type = d.type;
  if (d.date !== undefined) row.date = d.date;
  if (d.results !== undefined) row.results = d.results;
  if (d.overallNotes !== undefined) row.overall_notes = d.overallNotes;
  if (d.recommendations !== undefined) row.recommendations = d.recommendations;
  if (d.nextAssessmentDate !== undefined) {
    row.next_assessment_date = d.nextAssessmentDate || null;
  }
  if (d.status !== undefined) row.status = d.status;
  if (d.reviewedBy !== undefined) row.reviewed_by = d.reviewedBy || null;
  if (d.reviewedAt !== undefined) row.reviewed_at = d.reviewedAt;
  return row;
}

export function mapBilling(r: any): Billing {
  const p = r.period ?? {};
  return {
    id: str(r.id)!,
    clientId: str(r.client_id)!,
    invoiceNumber: str(r.invoice_number) ?? '',
    // period jsonb defaults to '{}', so guard rather than constructing
    // Invalid Date, which would serialise to garbage on the next save.
    period: {
      startDate: dateOrUndef(p.startDate) ?? new Date(0),
      endDate: dateOrUndef(p.endDate) ?? new Date(0),
    },
    services: r.services ?? [],
    subtotal: num(r.subtotal),
    tax: num(r.tax),
    total: num(r.total),
    currency: r.currency ?? 'AUD',
    dueDate: new Date(r.due_date),
    status: r.status ?? 'Draft',
    paymentDate: r.payment_date ? new Date(r.payment_date) : undefined,
    paymentMethod: r.payment_method ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: new Date(r.created_at),
    modifiedAt: r.modified_at ? new Date(r.modified_at) : undefined,
  };
}

export function toBillingRow(d: Partial<Billing>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.clientId !== undefined) row.client_id = d.clientId;
  if (d.invoiceNumber !== undefined) row.invoice_number = d.invoiceNumber;
  if (d.period !== undefined) {
    row.period = {
      startDate: d.period.startDate?.toISOString() ?? null,
      endDate: d.period.endDate?.toISOString() ?? null,
    };
  }
  if (d.services !== undefined) row.services = d.services;
  if (d.subtotal !== undefined) row.subtotal = d.subtotal;
  if (d.tax !== undefined) row.tax = d.tax;
  if (d.total !== undefined) row.total = d.total;
  if (d.currency !== undefined) row.currency = d.currency;
  if (d.dueDate !== undefined) row.due_date = d.dueDate;
  if (d.status !== undefined) row.status = d.status;
  if (d.paymentDate !== undefined) row.payment_date = d.paymentDate || null;
  if (d.paymentMethod !== undefined) row.payment_method = d.paymentMethod || null;
  if (d.notes !== undefined) row.notes = d.notes;
  return row;
}

export function mapPayroll(r: any): Payroll {
  const p = r.period ?? {};
  return {
    id: str(r.id)!,
    caregiverId: str(r.caregiver_id)!,
    period: {
      startDate: dateOrUndef(p.startDate) ?? new Date(0),
      endDate: dateOrUndef(p.endDate) ?? new Date(0),
    },
    hoursWorked: num(r.hours_worked),
    regularHours: num(r.regular_hours),
    overtimeHours: num(r.overtime_hours),
    hourlyRate: num(r.hourly_rate),
    overtimeRate: num(r.overtime_rate),
    grossPay: num(r.gross_pay),
    deductions: r.deductions ?? [],
    netPay: num(r.net_pay),
    currency: r.currency ?? 'AUD',
    status: r.status ?? 'Pending',
    paymentDate: r.payment_date ? new Date(r.payment_date) : undefined,
    paymentMethod: r.payment_method ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: new Date(r.created_at),
    modifiedAt: r.modified_at ? new Date(r.modified_at) : undefined,
  };
}

export function toPayrollRow(d: Partial<Payroll>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.caregiverId !== undefined) row.caregiver_id = d.caregiverId;
  if (d.period !== undefined) {
    row.period = {
      startDate: d.period.startDate?.toISOString() ?? null,
      endDate: d.period.endDate?.toISOString() ?? null,
    };
  }
  if (d.hoursWorked !== undefined) row.hours_worked = d.hoursWorked;
  if (d.regularHours !== undefined) row.regular_hours = d.regularHours;
  if (d.overtimeHours !== undefined) row.overtime_hours = d.overtimeHours;
  if (d.hourlyRate !== undefined) row.hourly_rate = d.hourlyRate;
  if (d.overtimeRate !== undefined) row.overtime_rate = d.overtimeRate;
  if (d.grossPay !== undefined) row.gross_pay = d.grossPay;
  if (d.deductions !== undefined) row.deductions = d.deductions;
  if (d.netPay !== undefined) row.net_pay = d.netPay;
  if (d.currency !== undefined) row.currency = d.currency;
  if (d.status !== undefined) row.status = d.status;
  if (d.paymentDate !== undefined) row.payment_date = d.paymentDate || null;
  if (d.paymentMethod !== undefined) row.payment_method = d.paymentMethod || null;
  if (d.notes !== undefined) row.notes = d.notes;
  return row;
}

export function mapForm(r: any): Form {
  return {
    id: str(r.id)!,
    title: str(r.title),
    description: r.description ?? undefined,
    type: r.type,
    clientId: r.client_id ?? undefined,
    caregiverId: r.caregiver_id ?? undefined,
    shiftId: r.shift_id ?? undefined,
    fields: r.fields ?? [],
    responses: r.responses ?? [],
    status: r.status ?? 'Draft',
    submittedAt: r.submitted_at ? new Date(r.submitted_at) : undefined,
    reviewedBy: r.reviewed_by ?? undefined,
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at) : undefined,
    createdBy: str(r.created_by),
    createdAt: new Date(r.created_at),
    modifiedAt: r.modified_at ? new Date(r.modified_at) : undefined,
  };
}

export function toFormRow(d: Partial<Form>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.title !== undefined) row.title = d.title;
  if (d.description !== undefined) row.description = d.description || null;
  if (d.type !== undefined) row.type = d.type;
  if (d.clientId !== undefined) row.client_id = d.clientId || null;
  if (d.caregiverId !== undefined) row.caregiver_id = d.caregiverId || null;
  if (d.shiftId !== undefined) row.shift_id = d.shiftId || null;
  if (d.fields !== undefined) row.fields = d.fields;
  if (d.responses !== undefined) row.responses = d.responses;
  if (d.status !== undefined) row.status = d.status;
  if (d.submittedAt !== undefined) row.submitted_at = d.submittedAt;
  if (d.reviewedBy !== undefined) row.reviewed_by = d.reviewedBy || null;
  if (d.reviewedAt !== undefined) row.reviewed_at = d.reviewedAt;
  if (d.createdBy !== undefined) row.created_by = d.createdBy;
  return row;
}

export function mapCostCode(r: any): CostCode {
  return {
    id: str(r.id)!,
    code: str(r.code),
    description: str(r.description),
    supportCategory: r.support_category ?? undefined,
    weekdayRate: numOrUndef(r.weekday_rate),
    eveningRate: numOrUndef(r.evening_rate),
    saturdayRate: numOrUndef(r.saturday_rate),
    sundayRate: numOrUndef(r.sunday_rate),
    publicHolidayRate: numOrUndef(r.public_holiday_rate),
    ndisPrice: numOrUndef(r.ndis_price),
    active: !!r.active,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

export function toCostCodeRow(d: Partial<CostCode>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.code !== undefined) row.code = d.code;
  if (d.description !== undefined) row.description = d.description;
  if (d.supportCategory !== undefined) row.support_category = d.supportCategory || null;
  if (d.weekdayRate !== undefined) row.weekday_rate = d.weekdayRate;
  if (d.eveningRate !== undefined) row.evening_rate = d.eveningRate;
  if (d.saturdayRate !== undefined) row.saturday_rate = d.saturdayRate;
  if (d.sundayRate !== undefined) row.sunday_rate = d.sundayRate;
  if (d.publicHolidayRate !== undefined) row.public_holiday_rate = d.publicHolidayRate;
  if (d.ndisPrice !== undefined) row.ndis_price = d.ndisPrice;
  if (d.active !== undefined) row.active = d.active;
  return row;
}

export function mapWallPost(r: any): WallPost {
  return {
    id: str(r.id)!,
    authorId: str(r.author_id),
    authorName: str(r.author_name),
    content: str(r.content),
    priority: r.priority ?? 'normal',
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

export function toWallPostRow(d: Partial<WallPost>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.authorId !== undefined) row.author_id = d.authorId;
  if (d.authorName !== undefined) row.author_name = d.authorName;
  if (d.content !== undefined) row.content = d.content;
  if (d.priority !== undefined) row.priority = d.priority;
  return row;
}

export function mapPayrollSettings(r: any): PayrollSettings {
  return {
    id: str(r.id)!,
    fortnightAnchor: str(r.fortnight_anchor),
    timezone: str(r.timezone),
    varianceFlagMinutes: num(r.variance_flag_minutes),
    ordinaryHoursFlag: num(r.ordinary_hours_flag),
    cancellationBillablePercent: num(r.cancellation_billable_percent),
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

export function mapPayPeriod(r: any): PayPeriod {
  return {
    id: str(r.id)!,
    periodStart: str(r.period_start),
    periodEnd: str(r.period_end),
    status: r.status ?? 'open',
    createdAt: new Date(r.created_at),
  };
}

export function mapTimesheet(r: any): Timesheet {
  return {
    id: str(r.id)!,
    payPeriodId: str(r.pay_period_id)!,
    caregiverId: str(r.caregiver_id)!,
    status: r.status ?? 'draft',
    submittedAt: r.submitted_at ? new Date(r.submitted_at) : undefined,
    approvedAt: r.approved_at ? new Date(r.approved_at) : undefined,
    approvedBy: r.approved_by ?? undefined,
    rejectReason: r.reject_reason ?? undefined,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

export function mapTimesheetAdjustment(r: any): TimesheetAdjustment {
  return {
    id: str(r.id)!,
    timesheetId: str(r.timesheet_id)!,
    shiftId: r.shift_id ?? undefined,
    kind: r.kind,
    hours: num(r.hours),
    amount: num(r.amount),
    reason: str(r.reason),
    createdBy: r.created_by ?? undefined,
    createdAt: new Date(r.created_at),
  };
}

export function mapTimesheetTotal(r: any): TimesheetTotal {
  return {
    timesheetId: str(r.timesheet_id)!,
    caregiverId: str(r.caregiver_id)!,
    payPeriodId: str(r.pay_period_id)!,
    status: r.status ?? 'draft',
    completedShifts: num(r.completed_shifts),
    inProgressShifts: num(r.in_progress_shifts),
    pendingShifts: num(r.pending_shifts),
    approvedHours: num(r.approved_hours),
    grossPaySegments: num(r.gross_pay_segments),
    adjustments: num(r.adjustments),
    totalGross: num(r.total_gross),
  };
}

export function mapSupportCategory(r: any): SupportCategory {
  return {
    categoryNo: num(r.category_no),
    name: str(r.name),
    budgetGroup: r.budget_group ?? 'Core',
  };
}

export function mapParticipantPlan(r: any): ParticipantPlan {
  return {
    id: str(r.id)!,
    clientId: str(r.client_id)!,
    ndisNumber: r.ndis_number ?? undefined,
    managementType: r.management_type ?? 'self_managed',
    planManagerName: r.plan_manager_name ?? undefined,
    startDate: str(r.start_date),
    endDate: str(r.end_date),
    status: r.status ?? 'active',
    notes: r.notes ?? undefined,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

export function mapPlanBudget(r: any): PlanBudget {
  return {
    id: str(r.id)!,
    planId: str(r.plan_id)!,
    categoryNo: num(r.category_no),
    allocated: num(r.allocated),
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

export function mapBudgetSummary(r: any): BudgetSummary {
  return {
    planId: str(r.plan_id)!,
    categoryNo: num(r.category_no),
    name: str(r.name),
    budgetGroup: str(r.budget_group),
    allocated: num(r.allocated),
    spent: num(r.spent),
    committed: num(r.committed),
    remaining: num(r.remaining),
    percentUsed: num(r.percent_used),
  };
}

export function mapBudgetAdjustment(r: any): BudgetAdjustment {
  return {
    id: str(r.id)!,
    planId: str(r.plan_id)!,
    categoryNo: r.category_no ?? undefined,
    amount: num(r.amount),
    reason: str(r.reason),
    createdBy: r.created_by ?? undefined,
    createdAt: new Date(r.created_at),
  };
}

export function mapNewExpense(r: any): NewExpense {
  return {
    id: str(r.id),
    caregiverId: str(r.caregiver_id),
    clientId: r.client_id ?? undefined,
    planId: r.plan_id ?? undefined,
    categoryNo: r.category_no ?? undefined,
    shiftId: r.shift_id ?? undefined,
    kind: r.kind,
    description: str(r.description),
    incurredOn: str(r.incurred_on),
    amount: num(r.amount),
    reimburseWorker: !!r.reimburse_worker,
    receiptUrl: r.receipt_url ?? undefined,
    status: r.status ?? 'pending',
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at ? new Date(r.created_at) : undefined,
  };
}

export function toPayrollSettingsRow(d: Partial<PayrollSettings>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.fortnightAnchor !== undefined) row.fortnight_anchor = d.fortnightAnchor;
  if (d.timezone !== undefined) row.timezone = d.timezone;
  if (d.varianceFlagMinutes !== undefined) row.variance_flag_minutes = d.varianceFlagMinutes;
  if (d.ordinaryHoursFlag !== undefined) row.ordinary_hours_flag = d.ordinaryHoursFlag;
  if (d.cancellationBillablePercent !== undefined) row.cancellation_billable_percent = d.cancellationBillablePercent;
  return row;
}

export function toPayPeriodRow(d: Partial<PayPeriod>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.periodStart !== undefined) row.period_start = d.periodStart;
  if (d.periodEnd !== undefined) row.period_end = d.periodEnd;
  if (d.status !== undefined) row.status = d.status;
  return row;
}

export function toTimesheetRow(d: Partial<Timesheet>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.payPeriodId !== undefined) row.pay_period_id = d.payPeriodId;
  if (d.caregiverId !== undefined) row.caregiver_id = d.caregiverId;
  if (d.status !== undefined) row.status = d.status;
  if (d.submittedAt !== undefined) row.submitted_at = d.submittedAt;
  if (d.approvedAt !== undefined) row.approved_at = d.approvedAt;
  if (d.approvedBy !== undefined) row.approved_by = d.approvedBy || null;
  if (d.rejectReason !== undefined) row.reject_reason = d.rejectReason || null;
  return row;
}

export function toTimesheetAdjustmentRow(d: Partial<TimesheetAdjustment>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.timesheetId !== undefined) row.timesheet_id = d.timesheetId;
  if (d.shiftId !== undefined) row.shift_id = d.shiftId || null;
  if (d.kind !== undefined) row.kind = d.kind;
  if (d.hours !== undefined) row.hours = d.hours;
  if (d.amount !== undefined) row.amount = d.amount;
  if (d.reason !== undefined) row.reason = d.reason;
  if (d.createdBy !== undefined) row.created_by = d.createdBy || null;
  return row;
}

export function toParticipantPlanRow(d: Partial<ParticipantPlan>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.clientId !== undefined) row.client_id = d.clientId;
  if (d.ndisNumber !== undefined) row.ndis_number = d.ndisNumber || null;
  if (d.managementType !== undefined) row.management_type = d.managementType;
  if (d.planManagerName !== undefined) row.plan_manager_name = d.planManagerName || null;
  if (d.startDate !== undefined) row.start_date = d.startDate;
  if (d.endDate !== undefined) row.end_date = d.endDate;
  if (d.status !== undefined) row.status = d.status;
  if (d.notes !== undefined) row.notes = d.notes || null;
  return row;
}

export function toPlanBudgetRow(d: Partial<PlanBudget>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.planId !== undefined) row.plan_id = d.planId;
  if (d.categoryNo !== undefined) row.category_no = d.categoryNo;
  if (d.allocated !== undefined) row.allocated = d.allocated;
  return row;
}

export function toNewExpenseRow(d: Partial<NewExpense>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.caregiverId !== undefined) row.caregiver_id = d.caregiverId;
  if (d.clientId !== undefined) row.client_id = d.clientId || null;
  if (d.planId !== undefined) row.plan_id = d.planId || null;
  if (d.categoryNo !== undefined) row.category_no = d.categoryNo || null;
  if (d.shiftId !== undefined) row.shift_id = d.shiftId || null;
  if (d.kind !== undefined) row.kind = d.kind;
  if (d.description !== undefined) row.description = d.description;
  if (d.incurredOn !== undefined) row.incurred_on = d.incurredOn;
  if (d.amount !== undefined) row.amount = d.amount;
  if (d.reimburseWorker !== undefined) row.reimburse_worker = d.reimburseWorker;
  if (d.receiptUrl !== undefined) row.receipt_url = d.receiptUrl || null;
  if (d.status !== undefined) row.status = d.status;
  if (d.createdBy !== undefined) row.created_by = d.createdBy || null;
  return row;
}

export function toBudgetAdjustmentRow(d: Partial<BudgetAdjustment>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (d.planId !== undefined) row.plan_id = d.planId;
  if (d.categoryNo !== undefined) row.category_no = d.categoryNo || null;
  if (d.amount !== undefined) row.amount = d.amount;
  if (d.reason !== undefined) row.reason = d.reason;
  if (d.createdBy !== undefined) row.created_by = d.createdBy || null;
  return row;
}
