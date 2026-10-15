# Patient Health Checkup Package Booking

All endpoints below require the normal patient session (`Authorization: Bearer …` or the Mediqzy auth cookie). The server determines member type and eligibility; the client must not calculate corporate eligibility or prices.

| Endpoint | Purpose |
|---|---|
| `GET /api/health-checkups/me` | Returns `memberType` (`individual`/`corporate`), employee profile and linked corporate. |
| `GET /api/health-checkups/packages` | Returns only packages eligible for the logged-in member. |
| `GET /api/health-checkups/packages/:packageId` | Returns package tests, benefits, price and validity. |
| `GET /api/health-checkups/labs` | Returns active labs; corporate members receive only labs mapped to their corporate network. |
| `GET /api/health-checkups/slots?labId=&date=YYYY-MM-DD` | Returns lab-configured slots and live booked/unavailable state. No synthetic slots are returned. |
| `POST /api/health-checkups/bookings` | Creates a booking from `{packageId, labId, date, timeSlot, patient:{name,phone,email?}}`. Corporate eligible packages are billed to the employer when their price is zero. |
| `GET /api/health-checkups/bookings` | Lists the member's bookings. |
| `GET /api/health-checkups/bookings/:id` | Returns a booking confirmation and payment state. |
| `POST /api/health-checkups/bookings/:id/payment` | Creates or returns a Razorpay order when payment is required. |
| `POST /api/health-checkups/bookings/:id/payment/verify` | Verifies the Razorpay signature and confirms the booking. |
| `POST /api/health-checkups/bookings/:id/cancel` | Cancels an eligible booking with an optional reason. |
| `POST /api/health-checkups/bookings/:id/reschedule` | Changes date and slot after rechecking lab availability. |

After a booking is confirmed (immediately for a zero-price corporate benefit, or after payment verification for a paid package), the server makes best-effort email and WhatsApp confirmation attempts using the patient details. Delivery failure does not invalidate the booking and is logged for operations follow-up.

Corporate eligibility is read from `user_health_packages` joined through the active employee association. A package cannot be booked if it is expired, inactive, already used, or already has an active booking. Labs come from `corporate_network_assignments`; individual members see active labs. Availability is read from the lab's configured `metadata.healthCheckupSlots`/`pickupSlots` and occupied slots are removed server-side.

The Patient App flow is available at `/health-checkups`. The existing team-only `/api/corporate-bookings/*` endpoints remain for HR booking on behalf of employees and are not used by the patient flow.
