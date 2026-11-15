import { mobileRouters } from './mobile-route-manifest.js';

const string = { type: 'string' };
const id = { description: 'Database identifier of the specified resource.', oneOf: [{ type: 'integer' }, string] };
const object = { type: 'object', additionalProperties: true };
const array = items => ({ type: 'array', items });
const record = (properties, required = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const json = schema => ({ description: 'Response', content: { 'application/json': { schema } } });
const request = (properties, required = [], media = 'application/json') => ({ required: true,
  content: { [media]: { schema: record(properties, required) } } });
const message = record({ message: string, success: { type: 'boolean' }, code: string, errors: array(object) });
const pagination = record({ total: { type: 'integer' }, skip: { type: 'integer' }, limit: { type: 'integer' }, page: { type: 'integer' }, pages: { type: 'integer' } });
const schedule = { appointmentDate: { type: 'string', format: 'date' }, appointmentTime: { type: 'string', description: 'Local appointment time, HH:MM (Asia/Kolkata).' } };
export const mobileSchemas = {
  AppAppointment: record({ id, userId: id, doctorId: { ...id, nullable: true }, ...schedule, status: { type: 'string', enum: ['scheduled', 'confirmed', 'in-progress', 'completed', 'cancelled', 'no-show', 'rescheduled'] }, patientName: string,
    doctorName: string, consultationType: string, paymentStatus: string, metadata: object }, ['id', 'appointmentDate', 'appointmentTime', 'status']),
  AppLabTest: record({ id, userId: id, testType: string, testName: { ...string, nullable: true }, appointmentDate: { type: 'string', format: 'date-time' }, appointmentTime: { ...string, nullable: true },
    status: { type: 'string', enum: ['pending_confirmation', 'booked', 'completed', 'cancelled', 'no_show', 'rescheduled'] }, confirmationStatus: { type: 'string', enum: ['pending', 'confirmed', 'rejected'] },
    price: { oneOf: [string, { type: 'number' }], nullable: true }, total_amount: { oneOf: [string, { type: 'number' }], nullable: true }, metadata: { ...object, nullable: true } }, ['id', 'testType', 'appointmentDate', 'status']),
  AppPharmacyOrder: record({ id, order_id: string, user_id: id, status: string, items: array(object), total_amount: { oneOf: [string, { type: 'number' }], nullable: true } }, ['order_id', 'status']),
  AppMembershipCurrent: record({ userPlan: { ...object, nullable: true }, plan: { ...object, nullable: true }, coverage: { ...object, nullable: true }, utilisation: object, corporate: { ...object, nullable: true } }, ['userPlan', 'plan', 'coverage', 'utilisation', 'corporate']),
};
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const details = new Map();
const set = (method, path, value) => details.set(`${method} ${path}`, value);
const success = (properties, optional = {}) => record({ success: { type: 'boolean' }, ...properties, ...optional }, ['success', ...Object.keys(properties)]);

set('post', '/api/auth/login', { summary: 'Sign in with email, phone or employee login ID and password', requestBody: request({ email: string, phoneNumber: string, phone: string, password: string }, ['password']) });
set('post', '/api/auth/send-otp', { summary: 'Send a sign-in OTP', requestBody: request({ phoneNumber: string, email: string }) });
set('post', '/api/auth/verify-otp', { summary: 'Exchange a sign-in OTP for a session', requestBody: request({ phoneNumber: string, email: string, otp: string }, ['otp']) });
for (const path of ['refresh', 'logout', 'revoke']) set('post', `/api/auth/${path}`, { requestBody: request({ refreshToken: string }, []), description: 'Refresh token may be supplied in the mobile JSON body or the web httpOnly refresh cookie. Rotation/revocation is server controlled.' });
set('post', '/api/appointments', { summary: 'Book a consultation', requestBody: request({ doctorId: id, ...schedule, consultationType: { type: 'string', enum: ['video', 'audio', 'chat', 'in-person', 'review', 'follow-up', 'followup'] }, symptoms: string, reason: string }, ['doctorId', 'appointmentDate', 'appointmentTime', 'consultationType']), responses: { 201: json(success({ data: object })) } });
for (const path of ['', '/my', '/my-appointments', '/upcoming']) set('get', `/api/appointments${path}`, { summary: 'List the authenticated patient’s appointments', parameters: ['status', 'consultationType', 'upcoming', 'past'].map(name => ({ name, in: 'query', schema: string })), responses: { 200: json(success({ data: array(ref('AppAppointment')), appointments: array(ref('AppAppointment')), count: { type: 'integer' } })) } });
set('get', '/api/appointments/{id}', { responses: { 200: json(record({ appointment: ref('AppAppointment') }, ['appointment'])) } });
set('patch', '/api/appointments/{id}/reschedule', { summary: 'Reschedule an owned appointment and its linked lab history', requestBody: request(schedule, ['appointmentDate', 'appointmentTime']) });
set('patch', '/api/appointments/{id}/cancel', { summary: 'Cancel an owned appointment and its linked lab history', requestBody: request({ reason: string, cancellationReason: string }) });
const labBookingTests = array(record({ id: { ...id, description: 'The test id from GET /api/labs/{labId}/tests (a catalogue test id).' }, name: string, price: { type: 'number', description: 'Ignored: the server prices every test from the catalogue.' } }, ['id']));
const labBookingQuote = record({ labId: id, labName: string, serviceType: { type: 'string', enum: ['checkup', 'diagnostic'] }, currency: { type: 'string', enum: ['INR'] },
  tests: array(record({ id, catalogTestId: string, code: { ...string, nullable: true }, name: string, price: { type: 'number' }, currency: string }, ['id', 'name'])),
  testsSubtotal: { type: 'number' }, collectionFee: { type: 'number', description: 'Always 0 for a lab-visit booking; no visit or base fee is charged.' },
  totalFee: { type: 'number', description: 'What POST /api/labs/book charges for this body.' }, paymentRequired: { type: 'boolean' },
  basis: { type: 'string', enum: ['catalog', 'corporate-package', 'corporate-family-discount', 'no-tests-selected'], description: 'catalog = sum of catalogue prices; corporate-package = prepaid by the employer, free to the employee.' } },
  ['labId', 'currency', 'tests', 'testsSubtotal', 'collectionFee', 'totalFee', 'paymentRequired', 'basis']);
set('post', '/api/labs/book/quote', { summary: 'Price a lab booking before it is made', description: 'Send the POST /api/labs/book body (appointmentDate/appointmentTime optional). Returns the total POST /api/labs/book will charge for it; both use one pricing function. Creates nothing. A test that is not bookable is refused with 400 errorCode TEST_NOT_BOOKABLE and unavailableTests [{id, name}].', requestBody: request({ labId: id, serviceType: { type: 'string', enum: ['checkup', 'diagnostic'] }, tests: labBookingTests, bookingFor: { type: 'string', enum: ['self', 'family'] }, familyMemberId: id, corporateBenefitSource: string, corporatePackageId: id, familyDiscountedPrice: { type: 'number' } }, ['labId', 'serviceType', 'tests']), responses: { 200: json(success({ quote: labBookingQuote })) } });
set('get', '/api/labs/{labId}/tests', { summary: 'Tests a lab can be booked for', description: 'Priced from the bookable catalogue: every id listed is accepted by POST /api/cart/add and priced identically by POST /api/labs/book. 404 for an unknown or inactive lab.', parameters: [{ name: 'serviceType', in: 'query', schema: { type: 'string', enum: ['checkup', 'diagnostic'] } }], responses: { 200: json(success({ tests: array(record({ id: string, catalogTestId: string, code: { ...string, nullable: true }, name: string, category: { ...string, nullable: true }, sampleType: { ...string, nullable: true }, price: { type: 'number' }, currency: string, homeCollectionCharge: { type: 'number', nullable: true }, duration: { ...string, nullable: true }, priceSource: { type: 'string', enum: ['catalog'] } }, ['id', 'name', 'price'])) })) } });
set('post', '/api/labs/book', { summary: 'Book a lab appointment and linked patient history atomically', description: 'Server-priced: each test is priced from the bookable catalogue by its id (a client price is ignored) and no other fee is added, so appointment.totalFee and payment.amount equal quote.totalFee from POST /api/labs/book/quote for the same body. A test that is not bookable is refused with 400 errorCode TEST_NOT_BOOKABLE and unavailableTests. Use labTestId for /api/lab-tests/{id} and mobile Orders. appointment.id is a separate reference for /api/appointments operations. Billing metadata preserves both references.', requestBody: request({ labId: id, ...schedule, serviceType: { type: 'string', enum: ['checkup', 'diagnostic'] }, testType: string, tests: labBookingTests, patientName: string, patientPhone: string, patientAddress: object, notes: string, bookingFor: { type: 'string', enum: ['self', 'family'] }, familyMemberId: id, corporatePackageId: id }, ['labId', 'appointmentDate', 'appointmentTime', 'serviceType']), responses: { 201: json(success({ labTestId: id, data: ref('AppLabTest'), appointment: object, payment: record({ required: { type: 'boolean' }, orderId: { ...id, nullable: true }, amount: { type: 'number' }, currency: string }, ['required', 'orderId', 'amount', 'currency']) }, { quote: labBookingQuote })) } });
set('get', '/api/lab-tests', { summary: 'List the caller’s lab booking history', parameters: ['status', 'testType', 'skip', 'limit'].map(name => ({ name, in: 'query', schema: ['skip','limit'].includes(name) ? { type: 'integer', minimum: 0 } : string })), responses: { 200: json(success({ data: array(ref('AppLabTest')), pagination })) } });
set('get', '/api/lab-tests/{id}', { responses: { 200: json(success({ data: ref('AppLabTest') })) } });
set('put', '/api/lab-tests/{id}', { summary: 'Update a lab booking and synchronize its appointment', requestBody: request({ ...schedule, notes: string, requiresFasting: { type: 'boolean' }, fastingHours: { type: 'integer' } }) });
set('post', '/api/lab-tests/{id}/cancel', { requestBody: request({ reason: string }), description: 'Updates the reciprocal appointment link in the same transaction.' });
set('post', '/api/lab-tests/checkout', { summary: 'Prepare a server-priced lab checkout', requestBody: request({ labId: id, testIds: { type: 'array', items: id, minItems: 1, maxItems: 30 }, date: { type: 'string', format: 'date' }, time: string, collectionType: { type: 'string', enum: ['home', 'lab'] }, address: record({ street: string, city: string, pincode: string }), notes: string }, ['labId', 'testIds', 'date', 'time', 'collectionType']) });
set('post', '/api/lab-tests/checkout/{orderId}/complete', { summary: 'Complete a paid lab checkout idempotently', description: 'The server verifies payment before creating the booking. Retry using the same order reference.' });
set('get', '/api/pharmacy-orders', { responses: { 200: json(success({ data: array(ref('AppPharmacyOrder')), pagination })) } });
set('post', '/api/pharmacy-orders', { summary: 'Place a pharmacy order with an optional prescription', requestBody: request({ items: { type: 'string', description: 'JSON encoded medicine_name/quantity items.' }, delivery_type: { type: 'string', enum: ['home_delivery', 'store_pickup'] }, delivery_address: { type: 'string', description: 'JSON address; required for home_delivery.' }, prescription: { type: 'string', format: 'binary' } }, ['items', 'delivery_type'], 'multipart/form-data') });
set('post', '/api/pharmacy-orders/{orderId}/cancel', { requestBody: request({ reason: string }) });
set('get', '/api/pharmacy/medicines', { summary: 'Search medicines', parameters: ['q', 'search', 'page', 'limit'].map(name => ({ name, in: 'query', schema: string })) });
set('get', '/api/pharmacy/medicines/{id}', { summary: 'Look up a medicine by numeric or CIMS ID' });
set('post', '/api/billing/payments/razorpay/create', { summary: 'Create payment for an owned billing order', requestBody: request({ orderId: id, amount: { type: 'number', deprecated: true, description: 'Ignored; the server prices the order.' }, currency: string }, ['orderId']) });
set('post', '/api/billing/payments/razorpay/verify', { summary: 'Verify a captured Razorpay payment for an owned order', requestBody: request({ orderId: id, razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string }, ['orderId', 'razorpayOrderId', 'razorpayPaymentId', 'razorpaySignature']) });
set('get', '/api/membership/my/current', { responses: { 200: json(ref('AppMembershipCurrent')) } });
set('get', '/api/membership/plans', { responses: { 200: json(record({ plans: array(object) }, ['plans'])) } });
set('post', '/api/membership/payment-order', { summary: 'Quote and create a server-priced membership payment', requestBody: request({ planId: id, amount: { type: 'number', description: 'Legacy client quote; server ignores it when calculating the amount charged.' }, planName: string, couponCode: string, scope: string }, ['planId']), description: 'Client-supplied prices are never trusted. Payment must be captured, owned by the caller, bound to this plan and unused before activation.' });
for (const [path] of [['subscribe/{planId}','planId'], ['upgrade/{newPlanId}','newPlanId']]) set('post', `/api/membership/${path}`, { requestBody: request({ razorpay_order_id: string, razorpay_payment_id: string, razorpay_signature: string, couponCode: string }), description: 'Self-service permits individual primary/add-on plans only. Corporate prepaid plans are assigned through the corporate process. Positive amounts require a verified payment.' });

set('get', '/api/lab-tests/{id}/invoice', { responses: { 200: json(success({ invoice: object })) } });

set('post', '/api/billing/payments/razorpay/create', { ...details.get('post /api/billing/payments/razorpay/create'), responses: { 200: json(success({ data: record({ orderId: string, amount: { type: 'number' }, amountInPaise: { type: 'number' }, currency: string, paymentId: id, key: string }, ['orderId', 'amount', 'currency', 'paymentId']) })) } });
set('post', '/api/payments/webhook', { summary: 'Receive a signed Razorpay webhook', description: 'The signature over the raw request body is verified before payment state changes.', parameters: [{ name: 'X-Razorpay-Signature', in: 'header', required: true, schema: string }], requestBody: request({ event: string, payload: object }, ['event', 'payload']) });

// Password and OTP aliases accept the same identifiers as the current handlers.
const identifiers = { identifier: string, email: string, phoneNumber: string, phone: string };
const identifierChoices = names => names.map(name => ({ required: [name] }));
const loginBody = request({ email: string, phoneNumber: string, phone: string, password: string }, ['password']);
loginBody.content['application/json'].schema.anyOf = identifierChoices(['email', 'phoneNumber', 'phone']);
for (const path of ['/api/auth/login', '/api/users/login']) set('post', path, { ...details.get(`post ${path}`), summary: 'Sign in with email, phone or employee login ID', requestBody: loginBody });
for (const [aliases, verify] of [[['/api/auth/send-otp','/api/users/login/send-otp'], false], [['/api/auth/verify-otp','/api/users/login/verify-otp'], true]]) {
  const body = request({ ...identifiers, ...(verify ? { code: string, otp: string } : {}) });
  body.content['application/json'].schema.allOf = [{ anyOf: identifierChoices(Object.keys(identifiers)) }, ...(verify ? [{ anyOf: identifierChoices(['code', 'otp']) }] : [])];
  for (const path of aliases) set('post', path, { summary: verify ? 'Verify a sign-in OTP' : 'Send a sign-in OTP', requestBody: body });
}
for (const path of ['refresh','logout','revoke']) {
  const detail = details.get(`post /api/auth/${path}`);
  detail.requestBody.required = false;
}
set('post', '/api/users/login/apple', { summary: 'Verify an Apple identity token and optional authorization code', requestBody: request({ identityToken: string, nonce: string, authorizationCode: string, fullName: object }, ['identityToken']) });
set('post', '/api/users/register', { summary: 'Register a patient account', requestBody: request({ email: string, password: string, firstName: string, lastName: string, phoneNumber: string, dateOfBirth: { type: 'string', format: 'date' }, gender: { type: 'string', enum: ['Male','Female','Other'] } }, ['email','password','firstName','lastName','phoneNumber','dateOfBirth','gender']) });

export const mobilePaths = {};
for (const { operations } of mobileRouters) for (const operation of operations) {
  const { method, path, tag, statuses, public: isPublic } = operation;
  const detail = details.get(`${method} ${path}`) || {};
  const parameters = [...path.matchAll(/\{([^}]+)\}/g)].map(match => ({ name: match[1], in: 'path', required: true, schema: string }));
  const responses = Object.fromEntries(statuses.map(status => [status, { $ref: '#/components/responses/AppObject' }]));
  for (const status of [400,401,403,404,409,422,429,500,502,503]) responses[status] = { $ref: `#/components/responses/${status === 429 ? 'AppRateLimited' : 'AppError'}` };
  mobilePaths[path] ||= {};
  mobilePaths[path][method] = {
    tags: [tag], summary: detail.summary || `${method.toUpperCase()} ${path}`,
    description: detail.description || 'See the resource-specific response fields. Additional response fields may be returned for compatibility. Authorization and tenant checks are enforced by the server.',
    ...(isPublic ? { security: [] } : {}),
    ...detail, parameters: [...parameters, ...(detail.parameters || [])], responses: { ...responses, ...detail.responses },
  };
}
// These handlers stream files rather than JSON.
for (const path of ['/api/billing/invoices/{invoiceId}/download']) {
  if (mobilePaths[path]?.get) mobilePaths[path].get.responses[200] = { description: 'Invoice document', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } };
}

export const mobileResponses = {
  AppObject: json(object),
  AppError: json(message),
  AppRateLimited: { ...json(message), headers: { 'Retry-After': { description: 'Seconds until retry is allowed.', schema: { type: 'integer' } } } },
};
