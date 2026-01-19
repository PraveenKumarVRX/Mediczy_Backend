# 📱 MOBILE APP INTEGRATION - QUICK START GUIDE

## For Mobile App Developers

This guide helps mobile app developers integrate the unified patient system into the Mediczy mobile app.

---

## 🎯 What Changed?

**Before:** Each clinic had separate patient endpoints  
**Now:** Single unified endpoints for all clinics

**Key Benefit:** One Mediczy app serves patients from ALL clinics

---

## 🚀 Quick Start (5 Minutes)

### Step 1: Update API Endpoints

**OLD (Clinic-specific - still works):**
```javascript
POST /api/clinic/1/patient/signup
POST /api/clinic/1/patient/login
```

**NEW (Unified - recommended for mobile app):**
```javascript
POST /api/patient/signup
POST /api/patient/login
GET  /api/patient/clinics/search
GET  /api/patient/profile
PATCH /api/patient/profile
```

### Step 2: Update Signup Flow

**Add clinic selection to signup:**

```javascript
// 1. Let user search for clinic
const searchClinics = async (searchQuery) => {
  const response = await fetch(
    `${API_BASE_URL}/api/patient/clinics/search?query=${searchQuery}`
  );
  const data = await response.json();
  return data.data.clinics; // Array of clinic objects
};

// 2. User selects clinic from search results
// Store clinic.slug for signup

// 3. Signup with clinic identifier
const signup = async (userData) => {
  const response = await fetch(`${API_BASE_URL}/api/patient/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clinic_slug: selectedClinic.slug,  // ← Clinic identifier
      email: userData.email,
      password: userData.password,
      first_name: userData.firstName,
      last_name: userData.lastName,
      phone: userData.phone,
      date_of_birth: userData.dateOfBirth,
      gender: userData.gender
    })
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Store JWT token
    await SecureStore.setItemAsync('jwt_token', data.data.token);
    
    // Store clinic info for future logins
    await AsyncStorage.setItem('last_clinic_slug', data.data.patient.clinic.slug);
    await AsyncStorage.setItem('clinic_name', data.data.patient.clinic.name);
    
    return data.data;
  }
  
  throw new Error(data.message);
};
```

### Step 3: Update Login Flow

**Add clinic selection to login:**

```javascript
const login = async (credentials) => {
  // Retrieve last used clinic (optional - for better UX)
  const lastClinicSlug = await AsyncStorage.getItem('last_clinic_slug');
  
  const response = await fetch(`${API_BASE_URL}/api/patient/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clinic_slug: credentials.clinicSlug || lastClinicSlug,  // ← Clinic identifier
      email: credentials.email,
      password: credentials.password
    })
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Store JWT token
    await SecureStore.setItemAsync('jwt_token', data.data.token);
    
    // Store clinic info
    await AsyncStorage.setItem('last_clinic_slug', data.data.patient.clinic.slug);
    await AsyncStorage.setItem('clinic_name', data.data.patient.clinic.name);
    
    // Cache patient profile
    await AsyncStorage.setItem('patient_profile', JSON.stringify(data.data.patient));
    
    return data.data;
  }
  
  throw new Error(data.message);
};
```

### Step 4: Add Clinic Search UI

**Example React Native component:**

```javascript
import React, { useState } from 'react';
import { View, TextInput, FlatList, TouchableOpacity, Text } from 'react-native';

const ClinicSearchScreen = ({ onClinicSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [clinics, setClinics] = useState([]);
  const [loading, setLoading] = useState(false);

  const searchClinics = async (query) => {
    if (query.length < 2) return;
    
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/patient/clinics/search?query=${query}`
      );
      const data = await response.json();
      
      if (data.success) {
        setClinics(data.data.clinics);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search for your hospital or clinic"
        value={searchQuery}
        onChangeText={(text) => {
          setSearchQuery(text);
          searchClinics(text);
        }}
      />
      
      <FlatList
        data={clinics}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.clinicItem}
            onPress={() => onClinicSelect(item)}
          >
            <Text style={styles.clinicName}>{item.name}</Text>
            <Text style={styles.clinicAddress}>
              {item.city}, {item.state}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {searchQuery ? 'No clinics found' : 'Start typing to search'}
          </Text>
        }
      />
    </View>
  );
};
```

---

## 📋 Complete Integration Checklist

### 1. API Integration

- [ ] Update API base URL
- [ ] Implement clinic search function
- [ ] Update signup API call (add clinic_slug)
- [ ] Update login API call (add clinic_slug)
- [ ] Add get profile API call
- [ ] Add update profile API call

### 2. Storage

- [ ] Store JWT token in SecureStore
- [ ] Store last used clinic slug in AsyncStorage
- [ ] Cache clinic name and logo
- [ ] Cache patient profile

### 3. UI Components

- [ ] Create clinic search screen
- [ ] Update signup form (add clinic selection)
- [ ] Update login screen (add clinic selection)
- [ ] Create profile screen
- [ ] Create profile edit screen

### 4. Navigation

- [ ] Add clinic search to signup flow
- [ ] Add clinic selection to login flow
- [ ] Handle "Remember last clinic" feature
- [ ] Handle clinic change (switch clinic)

### 5. Error Handling

- [ ] Handle clinic not found
- [ ] Handle invalid credentials
- [ ] Handle rate limiting (429)
- [ ] Handle network errors
- [ ] Handle token expiration

### 6. Testing

- [ ] Test signup with clinic A
- [ ] Test login with clinic A
- [ ] Test signup with clinic B (same email)
- [ ] Test data isolation (clinic A ≠ clinic B)
- [ ] Test clinic search
- [ ] Test profile update

---

## 🔑 API Authentication

### JWT Token Management

**Store token securely:**
```javascript
import * as SecureStore from 'expo-secure-store';

// After login/signup
await SecureStore.setItemAsync('jwt_token', data.data.token);

// For API calls
const token = await SecureStore.getItemAsync('jwt_token');
```

**Use token in API calls:**
```javascript
const getProfile = async () => {
  const token = await SecureStore.getItemAsync('jwt_token');
  
  const response = await fetch(`${API_BASE_URL}/api/patient/profile`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const data = await response.json();
  return data.data;
};
```

**Handle token expiration:**
```javascript
const apiCall = async (url, options = {}) => {
  const token = await SecureStore.getItemAsync('jwt_token');
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': token ? `Bearer ${token}` : undefined
    }
  });
  
  if (response.status === 401) {
    // Token expired - redirect to login
    await SecureStore.deleteItemAsync('jwt_token');
    navigation.navigate('Login');
    throw new Error('Session expired');
  }
  
  return response.json();
};
```

---

## 📱 Example React Native Screens

### Clinic Search Screen

```javascript
// screens/ClinicSearchScreen.js
import React, { useState, useEffect } from 'react';
import { View, TextInput, FlatList, TouchableOpacity, Text, Image } from 'react-native';

export default function ClinicSearchScreen({ navigation }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [clinics, setClinics] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.length >= 2) {
        searchClinics();
      } else {
        setClinics([]);
      }
    }, 300); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const searchClinics = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/patient/clinics/search?query=${searchQuery}`
      );
      const data = await response.json();
      
      if (data.success) {
        setClinics(data.data.clinics);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectClinic = (clinic) => {
    navigation.navigate('Signup', { clinic });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Find Your Hospital or Clinic</Text>
      
      <TextInput
        style={styles.searchInput}
        placeholder="Search by name or location"
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoFocus
      />
      
      <FlatList
        data={clinics}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.clinicCard}
            onPress={() => selectClinic(item)}
          >
            {item.logo && (
              <Image source={{ uri: item.logo }} style={styles.logo} />
            )}
            <View style={styles.clinicInfo}>
              <Text style={styles.clinicName}>{item.name}</Text>
              <Text style={styles.clinicType}>{item.organization_type}</Text>
              <Text style={styles.clinicAddress}>
                {item.city}, {item.state}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          loading ? (
            <Text>Searching...</Text>
          ) : (
            <Text style={styles.emptyText}>
              {searchQuery ? 'No clinics found' : 'Start typing to search'}
            </Text>
          )
        }
      />
    </View>
  );
}
```

### Signup Screen (with clinic)

```javascript
// screens/SignupScreen.js
import React, { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export default function SignupScreen({ route, navigation }) {
  const { clinic } = route.params;
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignup = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/patient/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_slug: clinic.slug,
          email: formData.email,
          password: formData.password,
          first_name: formData.firstName,
          last_name: formData.lastName,
          phone: formData.phone
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Store token
        await SecureStore.setItemAsync('jwt_token', data.data.token);
        
        // Store clinic info
        await AsyncStorage.setItem('last_clinic_slug', clinic.slug);
        await AsyncStorage.setItem('clinic_name', clinic.name);
        
        // Navigate to home
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign up with {clinic.name}</Text>
      
      {error ? <Text style={styles.error}>{error}</Text> : null}
      
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={formData.email}
        onChangeText={(text) => setFormData({ ...formData, email: text })}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={formData.password}
        onChangeText={(text) => setFormData({ ...formData, password: text })}
        secureTextEntry
      />
      
      <TextInput
        style={styles.input}
        placeholder="First Name"
        value={formData.firstName}
        onChangeText={(text) => setFormData({ ...formData, firstName: text })}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Last Name"
        value={formData.lastName}
        onChangeText={(text) => setFormData({ ...formData, lastName: text })}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Phone"
        value={formData.phone}
        onChangeText={(text) => setFormData({ ...formData, phone: text })}
        keyboardType="phone-pad"
      />
      
      <Button
        title={loading ? 'Signing up...' : 'Sign Up'}
        onPress={handleSignup}
        disabled={loading}
      />
    </View>
  );
}
```

### Login Screen

```javascript
// screens/LoginScreen.js
import React, { useState, useEffect } from 'react';
import { View, TextInput, Button, Text, TouchableOpacity } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clinicSlug, setClinicSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Load last used clinic
    loadLastClinic();
  }, []);

  const loadLastClinic = async () => {
    const lastClinic = await AsyncStorage.getItem('last_clinic_slug');
    if (lastClinic) {
      setClinicSlug(lastClinic);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/patient/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_slug: clinicSlug,
          email,
          password
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Store token
        await SecureStore.setItemAsync('jwt_token', data.data.token);
        
        // Store clinic info
        await AsyncStorage.setItem('last_clinic_slug', data.data.patient.clinic.slug);
        await AsyncStorage.setItem('clinic_name', data.data.patient.clinic.name);
        
        // Navigate to home
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login to Mediczy</Text>
      
      {error ? <Text style={styles.error}>{error}</Text> : null}
      
      <TouchableOpacity
        style={styles.clinicSelector}
        onPress={() => navigation.navigate('ClinicSearch')}
      >
        <Text>
          Clinic: {clinicSlug || 'Select Clinic'}
        </Text>
      </TouchableOpacity>
      
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      
      <Button
        title={loading ? 'Logging in...' : 'Login'}
        onPress={handleLogin}
        disabled={loading || !clinicSlug}
      />
      
      <TouchableOpacity onPress={() => navigation.navigate('ClinicSearch')}>
        <Text style={styles.signupLink}>
          Don't have an account? Sign up
        </Text>
      </TouchableOpacity>
    </View>
  );
}
```

---

## 🎯 Best Practices

### 1. Clinic Selection UX

**Recommended Flow:**
1. Show clinic search on first launch
2. Remember last used clinic
3. Allow changing clinic easily
4. Pre-fill clinic on login if available

### 2. Data Storage

**What to Store:**
- ✅ JWT token (SecureStore)
- ✅ Last clinic slug (AsyncStorage)
- ✅ Clinic name and logo URL (AsyncStorage)
- ✅ Patient profile (AsyncStorage, cache)

**What NOT to Store:**
- ❌ Password (never store)
- ❌ Sensitive medical data (use API)

### 3. Error Handling

**Common Errors:**
- Clinic not found → Redirect to clinic search
- Invalid credentials → Show error, allow retry
- Rate limited → Show "Too many attempts" message
- Network error → Show retry button
- Token expired → Redirect to login

### 4. Offline Support

**Cache Data:**
- Clinic list (search results)
- Patient profile
- Clinic details

**Queue Actions:**
- Profile updates
- Appointments booking
- Messages sending

---

## 🧪 Testing Scenarios

### Test Case 1: New Patient Signup
1. Open app
2. Click "Sign Up"
3. Search for "Apollo Chennai"
4. Select clinic
5. Fill signup form
6. Submit
7. ✅ Should receive JWT token
8. ✅ Should be logged in

### Test Case 2: Returning Patient Login
1. Open app
2. Click "Login"
3. See last clinic pre-filled
4. Enter email + password
5. Submit
6. ✅ Should receive JWT token
7. ✅ Should be logged in

### Test Case 3: Multi-Clinic Support
1. Patient A signs up with Clinic A
2. Patient A logs in → ✅ See Clinic A data
3. Patient B signs up with Clinic B (same email)
4. Patient B logs in → ✅ See Clinic B data (different)
5. ✅ Verify data isolation

---

## 📞 Support

**API Base URLs:**
- Development: `http://localhost:3000`
- Staging: `https://staging-api.mediczy.com`
- Production: `https://api.mediczy.com`

**Documentation:**
- User Guide: `MEDICZY_MOBILE_APP_MULTI_TENANT.md`
- Technical Guide: `TECHNICAL_UNIFIED_PATIENT_IMPLEMENTATION.md`

**Questions?** Contact backend team or check documentation.

---

**Status:** ✅ Ready for Integration  
**Version:** 1.0.0  
**Last Updated:** January 2, 2026
