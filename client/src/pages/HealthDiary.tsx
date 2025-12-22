import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, MessageSquare, Pill, Activity, Heart, Moon, Utensils, FileText, Filter, Search, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface HealthDiaryEntry {
  id: number;
  userId: number;
  entryDate: string;
  entryType: string;
  title: string;
  description: string;
  data: any;
  createdAt: string;
  updatedAt: string;
}

const HealthDiary: React.FC = () => {
  const [entries, setEntries] = useState<HealthDiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: '',
    end: ''
  });

  const entryTypes = [
    { value: 'all', label: 'All Entries', icon: FileText, color: 'gray' },
    { value: 'ai_consultation', label: 'AI Consultations', icon: MessageSquare, color: 'blue' },
    { value: 'consultation', label: 'Doctor Consultations', icon: MessageSquare, color: 'indigo' },
    { value: 'appointment', label: 'Appointments', icon: Calendar, color: 'purple' },
    { value: 'lab_test', label: 'Lab Tests', icon: Activity, color: 'cyan' },
    { value: 'lab_result', label: 'Lab Results', icon: Activity, color: 'teal' },
    { value: 'prescription', label: 'Prescriptions', icon: Pill, color: 'green' },
    { value: 'medication', label: 'Medications', icon: Pill, color: 'lime' },
    { value: 'vital', label: 'Vitals', icon: Heart, color: 'pink' },
    { value: 'device_reading', label: 'Device Readings', icon: Activity, color: 'orange' },
    { value: 'symptom', label: 'Symptoms', icon: Activity, color: 'red' },
    { value: 'diagnosis', label: 'Diagnoses', icon: FileText, color: 'rose' },
    { value: 'mood', label: 'Mood', icon: Heart, color: 'purple' },
    { value: 'sleep', label: 'Sleep', icon: Moon, color: 'indigo' },
    { value: 'diet', label: 'Diet', icon: Utensils, color: 'yellow' },
    { value: 'note', label: 'Notes', icon: FileText, color: 'gray' }
  ];

  useEffect(() => {
    fetchDiaryEntries();
  }, [selectedType, dateRange]);

  const fetchDiaryEntries = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      let url = '/api/health-diary?limit=100';
      if (selectedType !== 'all') {
        url += `&entryType=${selectedType}`;
      }
      if (dateRange.start) {
        url += `&startDate=${dateRange.start}`;
      }
      if (dateRange.end) {
        url += `&endDate=${dateRange.end}`;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch diary entries');
      }

      const data = await response.json();
      setEntries(data.entries || []);
    } catch (error) {
      console.error('Error fetching diary entries:', error);
      toast.error('Failed to load health diary');
    } finally {
      setLoading(false);
    }
  };

  const filteredEntries = entries.filter(entry => {
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      return (
        entry.title.toLowerCase().includes(search) ||
        entry.description.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const getEntryIcon = (type: string) => {
    const entryType = entryTypes.find(t => t.value === type);
    return entryType ? entryType.icon : FileText;
  };

  const getEntryColor = (type: string) => {
    const entryType = entryTypes.find(t => t.value === type);
    return entryType ? entryType.color : 'gray';
  };

  const renderEntryData = (entry: HealthDiaryEntry) => {
    // Special rendering for AI consultations
    if (entry.data?.consultationType === 'ai_chat' || entry.entryType === 'ai_consultation') {
      return (
        <div className="mt-4 space-y-3">
          <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
            <p className="text-sm font-semibold text-blue-900 mb-1">Your Message:</p>
            <p className="text-sm text-blue-800">{entry.data.userMessage || entry.description}</p>
          </div>
          <div className="bg-green-50 border-l-4 border-green-500 p-3 rounded">
            <p className="text-sm font-semibold text-green-900 mb-1">Dr. iSHA's Response:</p>
            <p className="text-sm text-green-800 whitespace-pre-wrap">{entry.data.aiResponse}</p>
          </div>
          {entry.data.symptomsDetected && entry.data.symptomsDetected.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs font-semibold text-gray-600">Symptoms Detected:</span>
              {entry.data.symptomsDetected.map((symptom: string, idx: number) => (
                <span key={idx} className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
                  {symptom}
                </span>
              ))}
            </div>
          )}
          {entry.data.sibUsed && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">
                🧠 Powered by Mediczy SIB
              </span>
              <span className="text-gray-400">Session: {entry.data.sessionId}</span>
            </div>
          )}
        </div>
      );
    }

    // Render consultation
    if (entry.entryType === 'consultation' || entry.entryType === 'appointment') {
      return (
        <div className="mt-3 space-y-2">
          {entry.data.doctorName && (
            <p className="text-sm"><span className="font-semibold">Doctor:</span> {entry.data.doctorName}</p>
          )}
          {entry.data.consultationType && (
            <p className="text-sm"><span className="font-semibold">Type:</span> {entry.data.consultationType}</p>
          )}
          {entry.data.status && (
            <span className={`inline-block px-2 py-1 text-xs rounded ${
              entry.data.status === 'completed' ? 'bg-green-100 text-green-800' : 
              entry.data.status === 'scheduled' ? 'bg-blue-100 text-blue-800' : 
              'bg-gray-100 text-gray-800'
            }`}>
              {entry.data.status}
            </span>
          )}
        </div>
      );
    }

    // Render prescription
    if (entry.entryType === 'prescription') {
      return (
        <div className="mt-3 space-y-2">
          {entry.data.medications && entry.data.medications.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-1">Medications:</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                {entry.data.medications.map((med: any, idx: number) => (
                  <li key={idx}>{med.name} - {med.dosage} - {med.frequency}</li>
                ))}
              </ul>
            </div>
          )}
          {entry.data.diagnosis && (
            <p className="text-sm"><span className="font-semibold">Diagnosis:</span> {entry.data.diagnosis}</p>
          )}
        </div>
      );
    }

    // Render lab test/result
    if (entry.entryType === 'lab_test' || entry.entryType === 'lab_result') {
      return (
        <div className="mt-3 space-y-2">
          {entry.data.testName && (
            <p className="text-sm font-semibold">{entry.data.testName}</p>
          )}
          {entry.data.results && (
            <div className="bg-blue-50 p-3 rounded">
              <p className="text-sm"><span className="font-semibold">Result:</span> {entry.data.results}</p>
              {entry.data.normalRange && (
                <p className="text-xs text-gray-600 mt-1">Normal Range: {entry.data.normalRange}</p>
              )}
            </div>
          )}
          {entry.data.status && (
            <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
              {entry.data.status}
            </span>
          )}
        </div>
      );
    }

    // Render vitals/device readings
    if (entry.entryType === 'vital' || entry.entryType === 'device_reading') {
      return (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {entry.data.vitalType && (
              <div className="bg-gray-50 p-2 rounded">
                <p className="text-xs text-gray-600">{entry.data.vitalType}</p>
                <p className="text-lg font-semibold">{entry.data.vitalValue} {entry.data.unit}</p>
              </div>
            )}
            {entry.data.source && (
              <div className="bg-gray-50 p-2 rounded">
                <p className="text-xs text-gray-600">Source</p>
                <p className="text-sm font-semibold">{entry.data.source}</p>
              </div>
            )}
          </div>
          {entry.data.deviceName && (
            <p className="text-xs text-gray-500">
              📱 {entry.data.deviceName} {entry.data.deviceType && `(${entry.data.deviceType})`}
            </p>
          )}
        </div>
      );
    }

    // Render medication
    if (entry.entryType === 'medication') {
      return (
        <div className="mt-3 space-y-1">
          {entry.data.medicationName && (
            <p className="text-sm font-semibold">{entry.data.medicationName}</p>
          )}
          <div className="flex gap-4 text-sm text-gray-600">
            {entry.data.dosage && <span>Dosage: {entry.data.dosage}</span>}
            {entry.data.frequency && <span>Frequency: {entry.data.frequency}</span>}
          </div>
          {entry.data.action && (
            <span className={`inline-block px-2 py-1 text-xs rounded ${
              entry.data.action === 'prescribed' ? 'bg-green-100 text-green-800' :
              entry.data.action === 'taken' ? 'bg-blue-100 text-blue-800' :
              entry.data.action === 'missed' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {entry.data.action}
            </span>
          )}
        </div>
      );
    }

    // Render diagnosis
    if (entry.entryType === 'diagnosis') {
      return (
        <div className="mt-3 space-y-2">
          {entry.data.condition && (
            <p className="text-sm font-semibold">{entry.data.condition}</p>
          )}
          {entry.data.severity && (
            <span className={`inline-block px-2 py-1 text-xs rounded ${
              entry.data.severity === 'critical' ? 'bg-red-100 text-red-800' :
              entry.data.severity === 'high' ? 'bg-orange-100 text-orange-800' :
              entry.data.severity === 'moderate' ? 'bg-yellow-100 text-yellow-800' :
              'bg-green-100 text-green-800'
            }`}>
              {entry.data.severity}
            </span>
          )}
          {entry.data.icdCode && (
            <p className="text-xs text-gray-500">ICD Code: {entry.data.icdCode}</p>
          )}
        </div>
      );
    }

    // Default rendering for other entry types
    return entry.data && Object.keys(entry.data).length > 0 ? (
      <div className="mt-3 p-3 bg-gray-50 rounded text-sm">
        <pre className="whitespace-pre-wrap text-xs text-gray-700">
          {JSON.stringify(entry.data, null, 2)}
        </pre>
      </div>
    ) : null;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Health Diary</h1>
          <p className="text-gray-600">Track your health journey, AI consultations, and wellness activities</p>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow p-6 mb-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Entry Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Filter className="inline w-4 h-4 mr-1" />
                Filter by Type
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {entryTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="inline w-4 h-4 mr-1" />
                Start Date
              </label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="inline w-4 h-4 mr-1" />
                End Date
              </label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Search */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Search className="inline w-4 h-4 mr-1" />
              Search
            </label>
            <input
              type="text"
              placeholder="Search your health diary..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </motion.div>

        {/* Entries List */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : filteredEntries.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-lg shadow p-12 text-center"
          >
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No entries found</h3>
            <p className="text-gray-500">
              {searchQuery
                ? 'Try adjusting your search or filters'
                : 'Start by chatting with Dr. iSHA or add a health diary entry'}
            </p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {filteredEntries.map((entry, index) => {
              const Icon = getEntryIcon(entry.entryType);
              const color = getEntryColor(entry.entryType);

              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6"
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 bg-${color}-100 rounded-lg`}>
                      <Icon className={`w-6 h-6 text-${color}-600`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{entry.title}</h3>
                          <p className="text-sm text-gray-500 mt-1">{formatDate(entry.createdAt)}</p>
                        </div>
                        <span className={`px-3 py-1 text-xs font-medium bg-${color}-100 text-${color}-800 rounded-full`}>
                          {entry.entryType}
                        </span>
                      </div>
                      <p className="text-gray-700 mt-3">{entry.description}</p>
                      {renderEntryData(entry)}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default HealthDiary;
