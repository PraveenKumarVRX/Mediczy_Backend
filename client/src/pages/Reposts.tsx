import { useState } from "react";
import { Upload, Languages, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/utils/api";

interface AIResponse {
  description: string;
  language: string;
}

const languages = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "hi", label: "Hindi" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "ar", label: "Arabic" },
  { value: "ru", label: "Russian" },
];

export default function RepostsPage() {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [language, setLanguage] = useState("en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        setSelectedImage(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
        setError(null);
        setAiResponse(null);
      } else {
        setError("Please upload an image file");
      }
    }
  };

  const getBase64FromFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result?.toString().split(',')[1];
        if (base64String) {
          resolve(base64String);
        } else {
          reject(new Error('Failed to convert image to base64'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  const cleanMarkdown = (text: string): string => {
    return text
      .replace(/\*\*/g, '') // Remove bold markers
      .replace(/\*/g, '') // Remove italic markers
      .replace(/^- /gm, '• ') // Replace markdown bullets with bullet points
      .split('\n') // Split into lines
      .map(line => line.trim()) // Trim each line
      .filter(line => line.length > 0) // Remove empty lines
      .join('\n\n'); // Join with double newlines for spacing
  };

  const analyzeImage = async () => {
    if (!selectedImage) return;

    try {
      setLoading(true);
      setError(null);

      // Get base64 image data
      const base64Image = await getBase64FromFile(selectedImage);

      const response = await api.post('/ai/analyze-image', {
        image: base64Image,
        language
      });
      
      console.log('🔍 AI analyze-image response:', response.data);
      
      // Handle multiple response formats
      let description = '';
      if (response.data?.description) {
        description = response.data.description;
      } else if (response.data?.data?.description) {
        description = response.data.data.description;
      } else if (response.data?.analysis) {
        description = response.data.analysis;
      } else if (response.data?.result) {
        description = response.data.result;
      } else if (typeof response.data === 'string') {
        description = response.data;
      }
      
      if (!description) {
        throw new Error('No analysis result returned from server');
      }
      
      const cleanedDescription = cleanMarkdown(description);

      setAiResponse({
        description: cleanedDescription,
        language,
      });
    } catch (error: unknown) {
      console.error('❌ Image analysis error:', error);
      const apiError = error as any;
      const errorMessage =
        apiError?.response?.data?.details ||
        apiError?.response?.data?.error ||
        apiError?.response?.data?.message ||
        apiError?.message ||
        "Failed to analyze image.";
      
      setError(errorMessage.startsWith("Failed") ? errorMessage : `Failed to analyze image. ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setAiResponse(null);
    setError(null);
  };

  return (
    <div className="container py-6 space-y-6 bg-slate-50 dark:bg-slate-900 min-h-screen">
      <div className="flex items-center justify-between bg-white dark:bg-slate-800/50 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Scan & Explain Reports</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Upload a report image to extract and summarize findings in your preferred language.</p>
        </div>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="w-[180px] bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white">
            <Languages className="h-4 w-4 mr-2 text-teal-500" />
            <SelectValue placeholder="Select Language" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            {languages.map((lang) => (
              <SelectItem key={lang.value} value={lang.value} className="text-slate-800 dark:text-white hover:bg-teal-50 dark:hover:bg-slate-700">
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 shadow-sm">
        <CardContent className="p-6">
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
            AI-generated summaries are assistive only. Always confirm clinical decisions with a qualified doctor.
          </div>
          <div className="flex flex-col items-center space-y-4">
            {!imagePreview ? (
              <label className="w-full">
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center cursor-pointer hover:border-teal-500 dark:hover:border-teal-400 transition-colors bg-slate-50 dark:bg-slate-900/50">
                  <Upload className="h-8 w-8 mx-auto mb-4 text-teal-500 dark:text-teal-400" />
                  <p className="text-slate-600 dark:text-slate-300">
                    Click to upload an image or drag and drop
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    PNG, JPG up to 10MB
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleImageUpload}
                />
              </label>
            ) : (
              <div className="relative w-full">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                  onClick={clearImage}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {error && (
              <p className="text-red-500 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg border border-red-200 dark:border-red-800">{error}</p>
            )}

            {imagePreview && !loading && !aiResponse && (
              <Button onClick={analyzeImage} className="w-full bg-teal-500 hover:bg-teal-600 dark:bg-teal-600 dark:hover:bg-teal-700 text-white font-semibold">
                Analyze Image
              </Button>
            )}

            {loading && (
              <div className="flex items-center justify-center w-full p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800">
                <Loader2 className="h-6 w-6 animate-spin text-teal-500 dark:text-teal-400" />
                <span className="ml-2 text-slate-700 dark:text-slate-300">Analyzing image...</span>
              </div>
            )}

            {aiResponse && (
              <div className="w-full space-y-4 border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50">
                <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                  <span className="w-2 h-2 bg-teal-500 rounded-full"></span>
                  AI Analysis
                </h3>
                <div className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                  {aiResponse.description.split('\n').map((line, index) => (
                    <p key={index} className="mb-2 pl-4 border-l-2 border-teal-500/30 dark:border-teal-400/30">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 
