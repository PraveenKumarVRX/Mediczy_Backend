# 🎬 Video Consultation Page - AI Features Integration

## Overview
This document provides exact code snippets for integrating AI Vision and AI Scribe components into your video consultation page.

## File Location
Find your video consultation component at one of these locations:
```
- client/src/pages/doctor/DoctorVideoConsultation.tsx
- client/src/pages/consultation/VideoConsultation.tsx
- client/src/pages/video/Consultation.tsx
- client/src/components/VideoConsultation.tsx
```

**Tip**: Search for "LiveKit" or "video feed" in your codebase to find it.

---

## Step 1: Locate Your Video Consultation Component

### Current Structure (Sample)
```typescript
// Your current video consultation page might look like this:
export const VideoConsultation = () => {
  const [consultationData, setConsultationData] = useState({
    // ... existing state
  });

  return (
    <div className="video-consultation-container">
      <div className="video-feed">
        {/* LiveKit room or similar */}
      </div>
      
      <div className="prescription-form">
        {/* Prescription form */}
      </div>
    </div>
  );
};
```

---

## Step 2: Add Component Imports

**Add these imports at the top of your component file**:

```typescript
import AIVisionConsultation from '@/components/AIVisionConsultation';
import AIScribeConsultation from '@/components/AIScribeConsultation';
```

---

## Step 3: Add State Management for AI Features

**Add these states to your component**:

```typescript
// Storage for vision analysis results
const [visionAnalysisResult, setVisionAnalysisResult] = useState<any>(null);

// Storage for AI-generated medications and findings
const [aiGeneratedDrugs, setAiGeneratedDrugs] = useState<any[]>([]);

// Storage for scribe-generated prescription
const [aiScribePrescription, setAiScribePrescription] = useState<any>(null);

// Merged consultation data for prescription form
const [consultationData, setConsultationData] = useState({
  chiefComplaints: '',
  diagnosis: '',
  medications: [],
  labTests: [],
  instructions: '',
  notes: '',
});
```

---

## Step 4: Add Callback Handlers

**Add these handler functions to your component**:

```typescript
// Handle results from AI Vision component
const handleVisionAnalysis = (analysisResult: any) => {
  console.log('🎯 Vision analysis completed:', analysisResult);
  
  setVisionAnalysisResult(analysisResult);
  
  // Extract drug suggestions from vision analysis
  if (analysisResult?.drugSuggestions && Array.isArray(analysisResult.drugSuggestions)) {
    setAiGeneratedDrugs(analysisResult.drugSuggestions);
    
    // Optionally auto-add to medications
    setConsultationData(prev => ({
      ...prev,
      medications: [
        ...prev.medications,
        ...analysisResult.drugSuggestions.map((drug: any) => ({
          name: drug.name || drug,
          dosage: drug.dosage || '',
          frequency: drug.frequency || 'As advised',
          duration: drug.duration || '5-7 days',
          source: 'AI Vision',
        }))
      ]
    }));
  }
  
  // Extract ICD-10 codes
  if (analysisResult?.icd10Codes) {
    setConsultationData(prev => ({
      ...prev,
      diagnosis: `${prev.diagnosis} [${analysisResult.icd10Codes.join(', ')}]`
    }));
  }
};

// Handle results from AI Scribe component
const handleScribePrescription = (generatedPrescription: any) => {
  console.log('🎤 Prescription generated from scribe:', generatedPrescription);
  
  setAiScribePrescription(generatedPrescription);
  
  // Merge scribe data into consultation data
  setConsultationData(prev => ({
    chiefComplaints: generatedPrescription.chiefComplaints?.join(', ') || prev.chiefComplaints,
    diagnosis: generatedPrescription.diagnosis || prev.diagnosis,
    medications: [
      ...prev.medications,
      ...(generatedPrescription.medications || [])
    ],
    labTests: [
      ...prev.labTests,
      ...(generatedPrescription.labTests || [])
    ],
    instructions: [
      ...prev.instructions,
      ...(generatedPrescription.instructions || [])
    ].join('; '),
    notes: generatedPrescription.notes || prev.notes,
  }));
  
  // Show success notification
  toast({
    title: '✅ Prescription Generated',
    description: `Prescription with ${generatedPrescription.medications?.length || 0} medications ready for review`,
  });
};

// Handle adding merged prescription data to form
const handleMergePrescriptionData = () => {
  // This updates the main prescription form with AI-generated data
  // Implementation depends on your form structure
  console.log('Merged consultation data:', consultationData);
  
  // Example: Update your prescription form directly
  // formMethods.setValue('diagnosis', consultationData.diagnosis);
  // formMethods.setValue('medications', consultationData.medications);
  // etc.
};
```

---

## Step 5: Update Your Layout - Two Common Approaches

### Approach A: Sidebar Layout (RECOMMENDED)

**Use this if you want AI tools on the right side of video**:

```typescript
export const VideoConsultation = () => {
  // ... state and handlers from above

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-screen">
      {/* Main Video Feed - 70% width */}
      <div className="lg:col-span-3 flex flex-col bg-gray-900 rounded-lg overflow-hidden">
        <div className="flex-1 bg-black">
          {/* Your LiveKit room or video player */}
          <LiveKitRoom 
            sessionId={sessionId}
            appointmentId={appointmentId}
          />
        </div>
        
        <div className="bg-white border-t p-4">
          {/* Video controls, call info, etc. */}
        </div>
      </div>

      {/* AI Tools Sidebar - 30% width */}
      <div className="lg:col-span-1 bg-gray-50 rounded-lg overflow-y-auto space-y-4 p-4">
        {/* AI Vision Component */}
        <AIVisionConsultation
          sessionId={sessionId}
          appointmentId={appointmentId}
          onAnalysisComplete={handleVisionAnalysis}
        />

        {/* AI Scribe Component */}
        <AIScribeConsultation
          appointmentId={appointmentId}
          currentFormData={consultationData}
          onPrescriptionGenerated={handleScribePrescription}
        />
      </div>
    </div>
  );
};
```

### Approach B: Tabs Layout (ALTERNATIVE)

**Use this if you want tabs for different tools**:

```typescript
export const VideoConsultation = () => {
  const [activeAITab, setActiveAITab] = useState<'vision' | 'scribe'>('vision');
  // ... state and handlers

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-screen">
      {/* Video Feed */}
      <div className="lg:col-span-3">
        <LiveKitRoom sessionId={sessionId} appointmentId={appointmentId} />
      </div>

      {/* AI Tools with Tabs */}
      <div className="lg:col-span-1 bg-gray-50 rounded-lg overflow-hidden flex flex-col">
        {/* Tabs */}
        <div className="flex gap-2 p-2 border-b bg-white">
          <button
            onClick={() => setActiveAITab('vision')}
            className={`flex-1 py-2 px-3 text-sm font-medium rounded ${
              activeAITab === 'vision'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            👁️ Vision
          </button>
          <button
            onClick={() => setActiveAITab('scribe')}
            className={`flex-1 py-2 px-3 text-sm font-medium rounded ${
              activeAITab === 'scribe'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            🎤 Scribe
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeAITab === 'vision' && (
            <AIVisionConsultation
              sessionId={sessionId}
              appointmentId={appointmentId}
              onAnalysisComplete={handleVisionAnalysis}
            />
          )}
          
          {activeAITab === 'scribe' && (
            <AIScribeConsultation
              appointmentId={appointmentId}
              currentFormData={consultationData}
              onPrescriptionGenerated={handleScribePrescription}
            />
          )}
        </div>
      </div>
    </div>
  );
};
```

---

## Step 6: Connect AI Data to Prescription Form

**Add this code to merge AI-generated data into your prescription form**:

```typescript
// Function to update prescription form with AI data
const applyAIPrescriptionData = () => {
  // If using React Hook Form:
  if (formMethods) {
    formMethods.setValue('chief_complaints', consultationData.chiefComplaints);
    formMethods.setValue('diagnosis', consultationData.diagnosis);
    formMethods.setValue('medications', consultationData.medications);
    formMethods.setValue('lab_tests', consultationData.labTests);
    formMethods.setValue('instructions', consultationData.instructions);
    formMethods.setValue('notes', consultationData.notes);
    
    // Show confirmation
    toast({
      title: '✅ Applied',
      description: 'AI-generated prescription data applied to form',
    });
  }
  
  // Or if using simple state:
  setPrescriptionForm(consultationData);
};

// Add a button in your prescription form section:
// <button onClick={applyAIPrescriptionData} className="...">
//   Apply AI Data
// </button>
```

---

## Step 7: Add a Data Review Section

**Add this component before the "Issue Prescription" button**:

```typescript
{/* AI Data Review Section */}
{(visionAnalysisResult || aiScribePrescription) && (
  <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 space-y-3">
    <h3 className="text-lg font-bold text-blue-900">📋 AI-Generated Data Preview</h3>
    
    <div className="grid grid-cols-2 gap-3 text-sm">
      {/* Vision Results */}
      {visionAnalysisResult && (
        <div className="bg-white p-3 rounded border border-blue-200">
          <p className="font-semibold text-blue-800">👁️ Vision Analysis</p>
          <ul className="mt-2 space-y-1 text-gray-700">
            <li>• {visionAnalysisResult.findings?.substring(0, 50)}...</li>
            {visionAnalysisResult.drugSuggestions?.length > 0 && (
              <li>• {visionAnalysisResult.drugSuggestions.length} drug suggestions</li>
            )}
            {visionAnalysisResult.icd10Codes?.length > 0 && (
              <li>• {visionAnalysisResult.icd10Codes.length} ICD-10 codes</li>
            )}
          </ul>
        </div>
      )}
      
      {/* Scribe Results */}
      {aiScribePrescription && (
        <div className="bg-white p-3 rounded border border-green-200">
          <p className="font-semibold text-green-800">🎤 Scribe Generation</p>
          <ul className="mt-2 space-y-1 text-gray-700">
            <li>• Diagnosis: {aiScribePrescription.diagnosis?.substring(0, 40)}...</li>
            <li>• {aiScribePrescription.medications?.length || 0} medications</li>
            <li>• {aiScribePrescription.labTests?.length || 0} lab tests</li>
          </ul>
        </div>
      )}
    </div>
    
    <button
      onClick={applyAIPrescriptionData}
      className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-2 px-4 rounded"
    >
      ✅ Apply AI Data to Prescription
    </button>
  </div>
)}
```

---

## Complete Example Integration

Here's a complete example of a video consultation component with AI integration:

```typescript
import React, { useState } from 'react';
import AIVisionConsultation from '@/components/AIVisionConsultation';
import AIScribeConsultation from '@/components/AIScribeConsultation';
import { useToast } from '@/components/ui/use-toast';
import LiveKitRoom from '@/components/LiveKitRoom';

interface VideoConsultationProps {
  sessionId: string;
  appointmentId: string;
}

export const VideoConsultation: React.FC<VideoConsultationProps> = ({
  sessionId,
  appointmentId,
}) => {
  const { toast } = useToast();
  
  // AI Feature State
  const [visionAnalysisResult, setVisionAnalysisResult] = useState<any>(null);
  const [aiScribePrescription, setAiScribePrescription] = useState<any>(null);
  
  // Consultation Data
  const [consultationData, setConsultationData] = useState({
    chiefComplaints: '',
    diagnosis: '',
    medications: [],
    labTests: [],
    instructions: '',
    notes: '',
  });

  // Vision Analysis Handler
  const handleVisionAnalysis = (analysisResult: any) => {
    console.log('Vision analysis:', analysisResult);
    setVisionAnalysisResult(analysisResult);
    
    if (analysisResult?.drugSuggestions) {
      setConsultationData(prev => ({
        ...prev,
        medications: [
          ...prev.medications,
          ...analysisResult.drugSuggestions.map((drug: any) => ({
            name: drug.name,
            dosage: drug.dosage || '',
            frequency: drug.frequency || 'As advised',
            duration: drug.duration || '5-7 days',
          }))
        ]
      }));
    }
  };

  // Scribe Prescription Handler
  const handleScribePrescription = (generatedPrescription: any) => {
    console.log('Generated prescription:', generatedPrescription);
    setAiScribePrescription(generatedPrescription);
    
    setConsultationData(prev => ({
      ...prev,
      chiefComplaints: generatedPrescription.chiefComplaints?.join(', ') || '',
      diagnosis: generatedPrescription.diagnosis || '',
      medications: [...prev.medications, ...(generatedPrescription.medications || [])],
      labTests: [...prev.labTests, ...(generatedPrescription.labTests || [])],
      instructions: generatedPrescription.instructions?.join('; ') || '',
    }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-screen bg-gray-100 p-4">
      {/* Video Feed - 70% */}
      <div className="lg:col-span-3 bg-white rounded-lg shadow-lg overflow-hidden flex flex-col">
        <div className="flex-1 bg-black">
          <LiveKitRoom sessionId={sessionId} appointmentId={appointmentId} />
        </div>
      </div>

      {/* AI Tools Sidebar - 30% */}
      <div className="lg:col-span-1 bg-white rounded-lg shadow-lg overflow-y-auto space-y-4 p-4">
        <h2 className="text-lg font-bold text-gray-800">🤖 AI Assistance</h2>
        
        <AIVisionConsultation
          sessionId={sessionId}
          appointmentId={appointmentId}
          onAnalysisComplete={handleVisionAnalysis}
        />

        <AIScribeConsultation
          appointmentId={appointmentId}
          currentFormData={consultationData}
          onPrescriptionGenerated={handleScribePrescription}
        />

        {/* Data Summary */}
        {(visionAnalysisResult || aiScribePrescription) && (
          <div className="bg-blue-50 p-3 rounded text-sm text-gray-700 border border-blue-200">
            <p className="font-bold mb-2">📊 Data Collected:</p>
            <ul className="space-y-1">
              <li>✓ {consultationData.medications.length} medications</li>
              <li>✓ {consultationData.labTests.length} lab tests</li>
              <li>✓ Diagnosis: {consultationData.diagnosis?.substring(0, 40)}...</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoConsultation;
```

---

## Step 8: Style Adjustments (Optional)

### Add Tailwind CSS Classes for Better Layout

If you want responsive behavior on mobile:

```typescript
<div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-4 xl:grid-cols-4 gap-4 h-screen">
  {/* Col classes: 
      - Mobile (default): 1 column
      - Tablet (md): 1 column (stacked)
      - Desktop (lg): 4 columns (70% + 30%)
      - XL (xl): 4 columns (same as lg)
  */}
  
  <div className="lg:col-span-3">Video</div>   {/* 75% on large */}
  <div className="lg:col-span-1">Tools</div>   {/* 25% on large */}
</div>
```

---

## Testing Checklist After Integration

After integrating, verify:

- [ ] Components render without errors
- [ ] No console errors or warnings
- [ ] Video feed displays correctly
- [ ] Vision component buttons visible and clickable
- [ ] Scribe component microphone accessible
- [ ] Vision analysis returns data within 5 seconds
- [ ] Scribe transcription displays in real-time
- [ ] Generated prescriptions appear properly
- [ ] Data merges correctly into consultation form
- [ ] Mobile layout is responsive (test on phone)
- [ ] Toast notifications appear for success/errors
- [ ] All TypeScript types compile without errors

---

## Common Issues & Solutions

### Issue: Components not showing
**Solution**: 
```bash
# Verify files exist
ls -la client/src/components/AI*.tsx
```

### Issue: "Cannot find module" errors
**Solution**: Check import paths match your project structure
```typescript
// Try different paths:
import AIVisionConsultation from '@/components/AIVisionConsultation';
import AIVisionConsultation from '../components/AIVisionConsultation';
import AIVisionConsultation from './components/AIVisionConsultation';
```

### Issue: Styling not applied
**Solution**: Verify Tailwind CSS is configured
```bash
# Check tailwind.config.js includes:
# content: ["./src/**/*.{js,ts,jsx,tsx}"]
```

---

## Next Steps

1. ✅ Copy this code into your video consultation page
2. ✅ Update component import paths if needed
3. ✅ Connect AI data to your prescription form
4. ✅ Test both AI features end-to-end
5. ✅ Deploy to staging environment
6. ✅ User acceptance testing
7. ✅ Production deployment

**Estimated Integration Time**: 30-60 minutes

