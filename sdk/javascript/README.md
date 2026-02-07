# Mediqzy API Client SDK

JavaScript/TypeScript client library for Mediqzy API v1 - Multi-tenant wellness platform

## Installation

```bash
npm install @mediqzy/api-client
```

## Quick Start

### Initialize Client

```javascript
const { MediqzyClient } = require('@mediqzy/api-client');

const client = new MediqzyClient({
  baseUrl: 'https://api.mediqzy.com/v1',
  tenantId: 'clinic-apollo',
  onTokenRefresh: (tokens) => {
    // Save tokens to secure storage
    console.log('Token refreshed:', tokens);
  }
});
```

### TypeScript

```typescript
import { MediqzyClient, MediqzyClientConfig } from '@mediqzy/api-client';

const config: MediqzyClientConfig = {
  baseUrl: 'https://api.mediqzy.com/v1',
  tenantId: 'clinic-apollo'
};

const client = new MediqzyClient(config);
```

## Authentication

### Exchange External Token

```javascript
const tokenResponse = await client.exchangeToken({
  providerToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
  provider: 'azure_ad',
  externalUserId: 'user-12345',
  role: 'patient'
});

console.log('Access Token:', tokenResponse.access_token);
```

### Refresh Token

```javascript
const newToken = await client.refreshAccessToken();
```

### Logout

```javascript
await client.revokeToken();
```

## User Management

### Create User

```javascript
const user = await client.createUser({
  external_user_id: 'ext-user-001',
  email: 'john.doe@example.com',
  phone: '+91-9876543210',
  first_name: 'John',
  last_name: 'Doe',
  date_of_birth: '1990-01-15',
  gender: 'male',
  address: {
    street: '123 Main Street',
    city: 'Mumbai',
    state: 'Maharashtra',
    postal_code: '400001',
    country: 'India'
  }
});
```

### Update Health Profile

```javascript
await client.updateHealthProfile('usr-123', {
  height_cm: 175,
  weight_kg: 70,
  blood_type: 'A+',
  allergies: ['Peanuts', 'Penicillin'],
  chronic_conditions: ['Hypertension'],
  medications: [
    {
      name: 'Amlodipine',
      dosage: '5mg',
      frequency: 'Once daily'
    }
  ]
});
```

## Doctor Search

### Search Doctors

```javascript
const doctorsResponse = await client.searchDoctors({
  specialty: 'Cardiology',
  city: 'Mumbai',
  minRating: 4.0,
  consultationType: 'online',
  sortBy: 'rating',
  limit: 10
});

console.log('Doctors:', doctorsResponse.doctors);
console.log('Total:', doctorsResponse.pagination.total);
```

### Get Available Slots

```javascript
const slots = await client.getDoctorSlots(
  'dr-abc123',
  '2026-02-10',
  'online'
);

console.log('Available Slots:', slots.slots);
```

## Appointments

### Book Appointment

```javascript
const appointment = await client.createAppointment({
  doctorId: 'dr-abc123',
  userId: 'usr-xyz789',
  appointmentDate: '2026-02-10',
  appointmentTime: '10:00',
  consultationType: 'online',
  reason: 'Chest pain and breathing difficulty',
  symptoms: ['Chest pain', 'Shortness of breath'],
  paymentMethod: 'wallet'
});

console.log('Appointment ID:', appointment.appointment_id);
console.log('Meeting Room:', appointment.meeting_details.room_id);
```

### List User Appointments

```javascript
const appointments = await client.listAppointments({
  userId: 'usr-xyz789',
  status: 'confirmed',
  fromDate: '2026-02-01',
  toDate: '2026-02-28'
});
```

### Reschedule Appointment

```javascript
const rescheduled = await client.rescheduleAppointment(
  'apt-12345',
  '2026-02-11',
  '14:00'
);
```

### Cancel Appointment

```javascript
await client.cancelAppointment(
  'apt-12345',
  'Emergency came up'
);
```

## Video Consultation

### Generate Video Token

```javascript
const videoToken = await client.generateVideoToken({
  appointmentId: 'apt-12345',
  participantType: 'patient',
  userId: 'usr-xyz789',
  name: 'John Doe'
});

console.log('LiveKit Token:', videoToken.token);
console.log('WebSocket URL:', videoToken.ws_url);
console.log('Room ID:', videoToken.room_id);
```

### React Native Integration

```javascript
import { LiveKitRoom } from '@livekit/react-native';

const VideoConsultation = ({ appointmentId, userId, name }) => {
  const [videoToken, setVideoToken] = useState(null);

  useEffect(() => {
    const loadToken = async () => {
      const token = await client.generateVideoToken({
        appointmentId,
        participantType: 'patient',
        userId,
        name
      });
      setVideoToken(token);
    };
    loadToken();
  }, []);

  if (!videoToken) return <Loading />;

  return (
    <LiveKitRoom
      serverUrl={videoToken.ws_url}
      token={videoToken.token}
      connect={true}
      audio={true}
      video={true}
    />
  );
};
```

### End Video Call

```javascript
await client.endVideoCall(
  'apt-12345-a1b2c3d4',
  25, // duration in minutes
  'https://storage.mediqzy.com/recordings/apt-12345.mp4'
);
```

## Error Handling

```javascript
try {
  const appointment = await client.createAppointment(appointmentData);
} catch (error) {
  if (error instanceof MediqzyAPIError) {
    console.error('API Error:', error.code, error.message);
    console.error('Status Code:', error.statusCode);
    
    // Handle specific errors
    if (error.code === 'SLOT_NOT_AVAILABLE') {
      alert('This time slot is already booked');
    }
  } else {
    console.error('Network Error:', error.message);
  }
}
```

## Complete Example: Patient Booking Flow

```javascript
const { MediqzyClient } = require('@mediqzy/api-client');

async function bookAppointment() {
  // Initialize client
  const client = new MediqzyClient({
    baseUrl: 'https://api.mediqzy.com/v1',
    tenantId: 'clinic-apollo'
  });

  try {
    // 1. Authenticate
    await client.exchangeToken({
      providerToken: externalOIDCToken,
      provider: 'azure_ad',
      externalUserId: 'user-12345',
      role: 'patient'
    });

    // 2. Create user profile
    const user = await client.createUser({
      external_user_id: 'user-12345',
      email: 'patient@example.com',
      phone: '+91-9876543210',
      first_name: 'John',
      last_name: 'Doe'
    });

    // 3. Search for doctors
    const doctors = await client.searchDoctors({
      specialty: 'Cardiology',
      city: 'Mumbai',
      consultationType: 'online',
      minRating: 4.0
    });

    const selectedDoctor = doctors.doctors[0];

    // 4. Get available slots
    const slots = await client.getDoctorSlots(
      selectedDoctor.doctor_id,
      '2026-02-10',
      'online'
    );

    const availableSlot = slots.slots.find(s => s.available);

    // 5. Book appointment
    const appointment = await client.createAppointment({
      doctorId: selectedDoctor.doctor_id,
      userId: user.user_id,
      appointmentDate: '2026-02-10',
      appointmentTime: availableSlot.time,
      consultationType: 'online',
      reason: 'Regular checkup',
      paymentMethod: 'wallet'
    });

    console.log('Appointment booked:', appointment.appointment_id);
    console.log('Meeting room:', appointment.meeting_details.room_id);

    // 6. Generate video token (when ready to join)
    const videoToken = await client.generateVideoToken({
      appointmentId: appointment.appointment_id,
      participantType: 'patient',
      userId: user.user_id,
      name: `${user.first_name} ${user.last_name}`
    });

    console.log('Join video call with token:', videoToken.token);

    return appointment;

  } catch (error) {
    console.error('Booking failed:', error);
    throw error;
  }
}

// Run the booking flow
bookAppointment()
  .then(appointment => console.log('Success!', appointment))
  .catch(error => console.error('Error:', error));
```

## API Reference

For complete API documentation, visit: https://docs.mediqzy.com/api/v1

## Support

- Email: api-support@mediqzy.com
- Documentation: https://docs.mediqzy.com
- GitHub Issues: https://github.com/mediqzy/api-client-js/issues

## License

MIT
