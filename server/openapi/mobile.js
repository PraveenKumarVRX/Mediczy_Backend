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
  AppPharmacyOrder: record({ id, order_id: string, user_id: id, status: string, items: array(object),
    patient: { nullable: true, ...record({ type: { type: 'string', enum: ['self', 'family_member'] }, family_member_id: { ...id, nullable: true }, name: { ...string, nullable: true }, relationship: { ...string, nullable: true } }) }, total_amount: { oneOf: [string, { type: 'number' }], nullable: true } }, ['order_id', 'status']),
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
const labBookingTests = array(record({ id: { ...id, description: 'The test id from GET /api/labs/{labId}/tests (a catalogue test id; a test_code or exact name is also accepted).' }, name: string, price: { type: 'number', description: 'Ignored: the server prices every test.' } }, ['id']));
const priceSource = { type: 'string', enum: ['lab', 'standard'], description: "lab = the lab's own price list (it offers only its listed tests, at its prices); standard = the platform Standard catalogue, used for a lab that has not set its own prices." };
const planBenefit = record({
  applied: { type: 'boolean', description: 'True when the plan took something off this booking.' },
  reason: { type: 'string', description: 'applied | no_active_plan | plan_has_no_lab_benefit | allowance_exhausted | plan_lab_benefit_period_unknown | lookup_failed | no_user | nothing_to_discount' },
  appliesTo: { type: 'string', enum: ['self', 'family-member'] },
  userPlanId: { ...id, nullable: true }, planId: { ...id, nullable: true }, planName: { ...string, nullable: true }, planType: { ...string, nullable: true },
  discountPct: { type: 'number', description: 'Percentage off the tests subtotal (membership_plans.metadata.coverageDetails.labTests.discountPct).' },
  limitINR: { type: 'number', description: 'Allowance the plan pays per period (coverageDetails.labTests.limitINR); 0 = none.' },
  period: { type: 'string', enum: ['plan_term', 'month'], nullable: true },
  usedINR: { type: 'number', nullable: true }, remainingINR: { type: 'number', nullable: true },
}, ['applied', 'reason']);
const corporatePackage = record({ packageId: string, packagePrice: { type: 'number', nullable: true }, familyDiscountPercent: { type: 'number', nullable: true }, familyPrice: { type: 'number', nullable: true } }, ['packageId']);
const labBookingQuote = record({ labId: id, labUid: { ...string, nullable: true, description: 'The lab’s entity uid (kind L).' }, labName: string, serviceType: { type: 'string', enum: ['checkup', 'diagnostic'] }, currency: { type: 'string', enum: ['INR'] },
  priceSource: { ...priceSource, nullable: true, description: `${priceSource.description} Null on a corporate health-package booking, which is not priced per test.` },
  tests: array(record({ id, catalogTestId: string, code: { ...string, nullable: true }, name: string, price: { type: 'number' }, currency: string, priceSource }, ['id', 'name'])),
  testsSubtotal: { type: 'number', description: 'Sum of the test prices (on a family health-package booking, the package price).' },
  planDiscount: { type: 'number', description: 'Taken off testsSubtotal by the member’s plan discount (or, on a family health-package booking, the package’s family discount).' },
  coveredAmount: { type: 'number', description: 'Paid by the member’s plan allowance after planDiscount.' },
  collectionFee: { type: 'number', description: 'Always 0 for a lab-visit booking; no visit or base fee is charged.' },
  totalFee: { type: 'number', description: 'testsSubtotal - planDiscount - coveredAmount: what POST /api/labs/book charges for this body.' }, paymentRequired: { type: 'boolean' },
  basis: { type: 'string', enum: ['catalog', 'plan-benefit', 'corporate-package', 'corporate-family-discount', 'no-tests-selected'], description: 'catalog = sum of test prices; plan-benefit = test prices less the member’s plan benefit; corporate-package = prepaid by the employer, free to the employee; corporate-family-discount = the package’s family price, from the employee’s entitlement.' },
  planBenefit: { ...planBenefit, nullable: true, description: 'The booking user’s plan lab benefit and whether it applied. Covers the account holder and verified family members on their list.' },
  corporatePackage: { ...corporatePackage, nullable: true } },
  ['labId', 'currency', 'tests', 'testsSubtotal', 'planDiscount', 'coveredAmount', 'collectionFee', 'totalFee', 'paymentRequired', 'basis']);
const labPricingErrors = 'A test the lab does not offer (or not bookable) is refused with 400 errorCode TEST_NOT_BOOKABLE and unavailableTests [{id, name}]. A family health-package booking whose package has no price or family discount configured is refused with 409 errorCode FAMILY_PRICE_NOT_CONFIGURED.';
set('post', '/api/labs/book/quote', { summary: 'Price a lab booking before it is made', description: `Send the POST /api/labs/book body (appointmentDate/appointmentTime optional). Returns the total POST /api/labs/book will charge for it; both use one pricing function: the lab’s own price list (or the Standard catalogue) less the booking user’s plan lab benefit. Creates nothing. ${labPricingErrors}`, requestBody: request({ labId: id, serviceType: { type: 'string', enum: ['checkup', 'diagnostic'] }, tests: labBookingTests, bookingFor: { type: 'string', enum: ['self', 'family'] }, familyMemberId: id, corporateBenefitSource: string, corporatePackageId: id, familyDiscountedPrice: { type: 'number', deprecated: true, description: 'Ignored: the server prices a family booking from the employee’s package entitlement.' } }, ['labId', 'serviceType', 'tests']), responses: { 200: json(success({ quote: labBookingQuote })) } });
set('get', '/api/labs/{labId}/tests', { summary: 'Tests a lab can be booked for, at its prices', description: 'The lab’s own price list when it has one (priceSource lab: only its active tests, at its prices), otherwise the Standard catalogue (priceSource standard). Every id listed is accepted by POST /api/cart/add with this labId and priced identically by POST /api/labs/book. A member’s plan benefit is not applied here; POST /api/labs/book/quote shows it. 404 for an unknown or inactive lab.', parameters: [{ name: 'serviceType', in: 'query', schema: { type: 'string', enum: ['checkup', 'diagnostic'] } }], responses: { 200: json(success({ priceSource, tests: array(record({ id: string, catalogTestId: string, code: { ...string, nullable: true }, name: string, category: { ...string, nullable: true }, sampleType: { ...string, nullable: true }, price: { type: 'number' }, currency: string, homeCollectionCharge: { type: 'number', nullable: true }, duration: { ...string, nullable: true }, priceSource }, ['id', 'name', 'price'])) }, { labId: string, labUid: { ...string, nullable: true } })) } });
set('post', '/api/labs/book', { summary: 'Book a lab appointment and linked patient history atomically', description: `Server-priced by the same function as POST /api/labs/book/quote: each test at the lab’s own price (or the Standard catalogue) by its id (a client price is ignored), less the booking user’s plan lab benefit, and no other fee is added, so appointment.totalFee and payment.amount equal quote.totalFee for the same body. If a plan allowance was spent by another booking in between, nothing is booked and 409 errorCode QUOTE_CHANGED returns the new quote. ${labPricingErrors} Use labTestId for /api/lab-tests/{id} and mobile Orders. appointment.id is a separate reference for /api/appointments operations. Billing metadata preserves both references.`, requestBody: request({ labId: id, ...schedule, serviceType: { type: 'string', enum: ['checkup', 'diagnostic'] }, testType: string, tests: labBookingTests, patientName: string, patientPhone: string, patientAddress: object, notes: string, bookingFor: { type: 'string', enum: ['self', 'family'] }, familyMemberId: id, corporateBenefitSource: string, corporatePackageId: id }, ['labId', 'appointmentDate', 'appointmentTime', 'serviceType']), responses: { 201: json(success({ labTestId: id, data: ref('AppLabTest'), appointment: object, payment: record({ required: { type: 'boolean' }, orderId: { ...id, nullable: true }, amount: { type: 'number' }, currency: string }, ['required', 'orderId', 'amount', 'currency']) }, { quote: labBookingQuote })) } });
const cartItem = record({ labId: { type: 'integer', nullable: true, description: 'The lab this line is priced at; null = Standard catalogue.' }, quantity: { type: 'integer', enum: [1] },
  test: record({ id, catalogTestId: string, testCode: { ...string, nullable: true }, name: string, price: { type: 'number' }, currency: string, homeCollectionCharge: { type: 'number', nullable: true }, labId: { type: 'integer', nullable: true }, priceSource }, ['id', 'catalogTestId', 'name', 'price', 'priceSource']) }, ['quantity', 'test']);
const cartResponse = success({ cart: array(cartItem), itemCount: { type: 'integer' }, total: { type: 'number', description: 'Sum of list prices. A plan benefit is applied by POST /api/labs/book/quote.' } }, { removedUnavailable: array(id), mergedDuplicates: array(id) });
const cartLab = { type: 'integer', description: 'The lab the test is booked at, so the line carries that lab’s price. May also be sent as test.labId. Without it the Standard catalogue price is used.' };
set('get', '/api/cart', { summary: 'The caller’s lab test cart, re-priced', description: 'Each line is re-priced at its lab’s current price (or the Standard catalogue); lines no longer bookable are removed and listed in removedUnavailable.', responses: { 200: json(cartResponse) } });
set('post', '/api/cart/add', { summary: 'Add a lab test to the cart', description: 'Server-priced at the lab’s own price list when labId names a lab that has one (only its listed tests are accepted), otherwise the Standard catalogue. The client price is ignored. A test that is not bookable is refused with 400 errorCode TEST_NOT_BOOKABLE.', requestBody: request({ test: record({ id, name: string, price: { type: 'number', description: 'Ignored.' }, labId: cartLab }, ['id']), labId: cartLab, quantity: { type: 'integer', description: 'Clamped to 1: a test is billed once per booking.' } }, ['test']), responses: { 200: json(cartResponse) } });
set('post', '/api/cart/sync', { summary: 'Replace the cart with the client’s items, re-priced', description: 'Each item is priced at its own labId (item.labId, item.test.labId or item.labInfo.id), else the body labId, else the Standard catalogue. Unbookable items are dropped and listed in removedUnavailable; the same test at the same lab twice is merged.', requestBody: request({ items: array(object), labId: cartLab }, ['items']), responses: { 200: json(cartResponse) } });
for (const [method, path] of [['delete', '/api/cart/remove/{testId}'], ['put', '/api/cart/update/{testId}'], ['delete', '/api/cart/clear']]) set(method, path, { responses: { 200: json(cartResponse) } });
set('get', '/api/lab-tests', { summary: 'List the caller’s lab booking history', parameters: ['status', 'testType', 'skip', 'limit'].map(name => ({ name, in: 'query', schema: ['skip','limit'].includes(name) ? { type: 'integer', minimum: 0 } : string })), responses: { 200: json(success({ data: array(ref('AppLabTest')), pagination })) } });
set('get', '/api/lab-tests/{id}', { responses: { 200: json(success({ data: ref('AppLabTest') })) } });
set('put', '/api/lab-tests/{id}', { summary: 'Update a lab booking and synchronize its appointment', requestBody: request({ ...schedule, notes: string, requiresFasting: { type: 'boolean' }, fastingHours: { type: 'integer' } }) });
set('post', '/api/lab-tests/{id}/cancel', { requestBody: request({ reason: string }), description: 'Updates the reciprocal appointment link in the same transaction.' });
set('post', '/api/lab-tests/checkout', { summary: 'Prepare a server-priced lab checkout', requestBody: request({ labId: id, testIds: { type: 'array', items: id, minItems: 1, maxItems: 30 }, date: { type: 'string', format: 'date' }, time: string, collectionType: { type: 'string', enum: ['home', 'lab'] }, address: record({ street: string, city: string, pincode: string }), notes: string }, ['labId', 'testIds', 'date', 'time', 'collectionType']) });
set('post', '/api/lab-tests/checkout/{orderId}/complete', { summary: 'Complete a paid lab checkout idempotently', description: 'The server verifies payment before creating the booking. Retry using the same order reference.' });
set('get', '/api/pharmacy-orders', { responses: { 200: json(success({ data: array(ref('AppPharmacyOrder')), pagination })) } });
set('post', '/api/pharmacy-orders', { summary: 'Place a pharmacy order with an optional prescription', requestBody: request({ items: { type: 'string', description: 'JSON encoded medicine_name/quantity items.' }, delivery_type: { type: 'string', enum: ['home_delivery', 'store_pickup'] }, delivery_address: { type: 'string', description: 'JSON address; required for home_delivery.' }, family_member_id: { ...id, description: 'Family member the order is for. Omit for the account holder.' }, prescription: { type: 'string', format: 'binary' } }, ['items', 'delivery_type'], 'multipart/form-data') });
set('post', '/api/pharmacy-orders/quote', { summary: 'Price a medicine basket without placing an order or using a coupon', requestBody: request({ items: array(object), coupon_code: string }, ['items']), responses: { 200: json(success({ data: record({ items: array(object), subtotal: { type: 'number' }, delivery_charge: { type: 'number' }, discount: { type: 'number' }, discount_type: { type: 'string', enum: ['automatic', 'coupon'], nullable: true }, coupon_code: { ...string, nullable: true }, total_amount: { type: 'number' }, currency: string, requires_prescription: array(object) }) })) } });
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
