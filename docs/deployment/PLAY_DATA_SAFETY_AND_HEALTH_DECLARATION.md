# Play Data safety & Health apps declaration — answers for `com.mysmarthealthtech.mediczy`

**Audience:** whoever fills in the Play Console forms.
**Prepared:** 2026-11-08, from the shipped `mobile/` source. Re-check it against the code before
each submission — a Data safety answer that does not match what the app transmits is a policy
violation, not a paperwork error, and Google re-reads the form on every update.

Companion doc: [APP_STORE_REVIEW_ACCESS.md](APP_STORE_REVIEW_ACCESS.md) (reviewer credentials and
the review origin).

---

## 1. The two distinctions the form turns on

**Collected vs processed ephemerally.** Play counts data as *collected* when the app transmits it
off the device. Data the app *receives* and only displays is not collected.

This app transmits: the email address and password at sign-in, first and last name at sign-up
(where the organisation enables it), and the booking fields — doctor, date, slot, consultation
type, and the free-text reason. Everything else on screen (profile details, prescriptions,
reports, vitals, checkups) is **received for display** and sent nowhere.

**The free-text reason field is the one to be careful about.** `BookAppointmentScreen` sends it to
`POST /api/appointments`, a patient types symptoms into it, and it is therefore transmitted health
information. Declare it. If you would rather not, remove the field — do not leave it in and answer
no.

**Where it goes.** Every request goes to the HTTPS origin the user entered on the first screen,
which is their own organisation's server. The app ships no analytics, advertising, crash-reporting
or attribution SDK — grep `mobile/package.json`; there is none — so nothing is transmitted to any
third party, including to us.

## 2. Data safety — section by section

### Data collection and security

| Question | Answer | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | Credentials, name and the booking fields are transmitted. |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | `canonicalOrigin()` in `mobile/src/connection/core.ts` rejects anything but `https://`, and `send()` refuses redirects, so there is no cleartext path. |
| Do you provide a way for users to request that their data be deleted? | **Yes** | In-app: Profile → Delete account. Also give the deletion URL (§4). |

### Data types

Declare each as **Collected: yes · Shared: no · Processed ephemerally: no · Required (not
optional) · Purpose: App functionality · Account management**.

| Category → type | Collected | Notes |
|---|---|---|
| Personal info → **Name** | Yes | Sent at sign-up (`manager.signup`). Also received for display at sign-in. |
| Personal info → **Email address** | Yes | Sent at every sign-in. |
| Personal info → **User IDs** | Yes | The server issues a patient id and a session token held in `expo-secure-store`. |
| Health and fitness → **Health info** | Yes | The free-text reason on `POST /api/appointments`. Purpose: App functionality. **Not** shared. |
| App activity → **Other actions** | Yes | A booking is an action recorded on the server. Declare if your reading of the taxonomy puts appointment creation here; it is otherwise covered by Health info. |

Do **not** declare: Location, Contacts, Photos, Files, Calendar, SMS, Call logs, Microphone,
Camera, Installed apps, Advertising ID, Device identifiers, Financial info, Messages, Web
browsing, or Approximate/Precise location. The app requests none of them.

> **One thing to fix before you answer.** `mobile/app.json` still declares the `expo-camera`,
> `expo-image-picker` and `expo-notifications` plugins with permission strings, and lists
> `expo-document-picker`, `expo-file-system`, `expo-av` and `expo-web-browser` as dependencies.
> **No screen uses any of them.** They put camera, photo and notification permissions in the
> manifest that the app never exercises, which is exactly the mismatch reviewers flag. Remove
> those plugins and dependencies, or build the features that justify them, *before* submitting —
> otherwise the manifest and this form disagree.

### Data types the app receives but does not collect

Nothing to enter on the form; recorded here so the next person does not over-declare. Profile
(phone, date of birth, gender, blood group, allergies), prescriptions and medicines, lab reports,
vitals, health-checkup bookings, notifications. All read-only, all from the user's own
organisation, none re-transmitted.

## 3. Health apps declaration

| Question | Answer |
|---|---|
| Is your app a health app? | **Yes** |
| Which category? | **Patient management / Health records** — it shows a patient their own appointments, prescriptions, reports and vitals at their healthcare provider, and lets them book a consultation. |
| Does the app provide medical or clinical advice, diagnosis or treatment? | **No.** The app displays records a clinician created and books appointments. It contains no AI output, no triage, no scoring and no clinical recommendation of any kind — none of the platform's AI endpoints are called from the app. |
| Does it handle Protected Health Information? | **Yes** — the signed-in patient's own records, retrieved from their own provider's server. |
| Clinical/regulatory evidence required? | **No**, on the strength of the previous answer. If an AI feature is ever surfaced in the app, this answer changes and `docs/ai/SAMD_READINESS_SCORECARD.md` governs what is then required. |
| Who is the app for? | Patients of the organisation whose server they connect to. Not for clinicians; the clinical portals are separate products. |

**Keep that third answer true.** The moment the app shows a risk score, a triage suggestion or any
model output, it stops being documentation-only and the SaMD rules in `CLAUDE.md` apply — a
Class IIb/III classification, a model card, quality gates and a declaration that no longer fits on
one line.

## 4. Account deletion URL

Play wants a web URL as well as the in-app path, reachable without signing in and stating what is
deleted and what is retained. **This does not exist yet** — there is no public deletion page on
mediqzy.com. It needs to be published before submission, and it should say:

- what deleting removes (the account, profile and the health data held against it);
- what is retained and why (records a clinician is legally required to keep stay in the
  organisation's medical record, per Indian medical-record retention rules);
- that deletion is immediate and irreversible;
- how to request it without the app (an email address that reaches a person).

The in-app path is Profile → Delete account → type DELETE, which calls
`POST /api/users/data/erasure`. Accounts flagged `metadata.doNotDelete`, the store-reviewer login
among them, are refused with `account_protected`.

## 5. Before each submission

1. Re-grep what the app sends: every transmitting call is in `mobile/src/api/patient.ts` and
   `mobile/src/connection/core.ts`. A new `POST` is a new Data safety answer.
2. Confirm `mobile/app.json` declares no permission the app does not use.
3. Confirm no AI or scoring output has reached a screen, which would change §3.
4. Confirm the deletion URL in §4 is live.
