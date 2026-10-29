import React, { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { useAuth } from '../../context/AuthContext';
import {
  Mic,
  Pause,
  StopCircle,
  Play,
  Save,
  Edit,
  Trash2,
  AlertCircle,
  Plus,
  FileText,
  Upload,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { Progress } from "../../components/ui/progress";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import VisitTypeTemplatesList from "../../components/transcription/VisitTypeTemplates";

interface TemplateField {
  name: string;
  label: string;
  pattern: RegExp;
  value: string;
}

interface VisitTypeTemplate {
  id: string;
  name: string;
  description?: string;
  template: string;
  fields: TemplateField[];
}

const VisitTypeTemplates: VisitTypeTemplate[] = [
  {
    id: "soap",
    name: "SOAP Notes Template",
    description: "Subjective, Objective, Assessment, Plan format",
    template: `SOAP NOTES

PATIENT INFORMATION:
Name of Pet: {petName}
Age: {age}
Species: {species}
Breed: {breed}
Owner: {owner}
Visit Type: {visitType}
Date: {date}

SUBJECTIVE:
{subject}

OBJECTIVE:
{object}

ASSESSMENT:
{assessment}

PLAN:
{plan}`,
    fields: [
      { name: "petName", label: "Name of Pet", pattern: /./, value: "" },
      { name: "age", label: "Age", pattern: /./, value: "" },
      { name: "species", label: "Species", pattern: /./, value: "" },
      { name: "breed", label: "Breed", pattern: /./, value: "" },
      { name: "owner", label: "Owner", pattern: /./, value: "" },
      { name: "visitType", label: "Visit Type", pattern: /./, value: "" },
      { name: "subject", label: "Subjective", pattern: /./, value: "" },
      { name: "object", label: "Objective", pattern: /./, value: "" },
      { name: "assessment", label: "Assessment", pattern: /./, value: "" },
      { name: "plan", label: "Plan", pattern: /./, value: "" }
    ]
  },
  {
    id: "medical",
    name: "Medical Examination Template",
    description: "Comprehensive medical examination notes",
    template: `MEDICAL EXAMINATION REPORT

Patient: {petName}
Age: {age}
Species: {species}
Breed: {breed}
Owner: {owner}
Date: {date}

VITAL SIGNS:
Temperature: {temperature}
Heart Rate: {heartRate}
Respiratory Rate: {respiratoryRate}

PHYSICAL EXAM:
Eyes: {eyes}
Ears: {ears}
Nose: {nose}
Mouth: {mouth}
Skin: {skin}
Cardiac: {cardiac}
Respiratory: {respiratory}
Abdominal: {abdominal}
Musculoskeletal: {musculoskeletal}
Neurological: {neurological}

ASSESSMENT:
{assessment}

TREATMENT PLAN:
{treatmentPlan}`,
    fields: [
      { name: "petName", label: "Patient", pattern: /./, value: "" },
      { name: "age", label: "Age", pattern: /./, value: "" },
      { name: "species", label: "Species", pattern: /./, value: "" },
      { name: "breed", label: "Breed", pattern: /./, value: "" },
      { name: "owner", label: "Owner", pattern: /./, value: "" },
      { name: "temperature", label: "Temperature", pattern: /./, value: "" },
      { name: "heartRate", label: "Heart Rate", pattern: /./, value: "" },
      { name: "respiratoryRate", label: "Respiratory Rate", pattern: /./, value: "" },
      { name: "eyes", label: "Eyes", pattern: /./, value: "" },
      { name: "ears", label: "Ears", pattern: /./, value: "" },
      { name: "nose", label: "Nose", pattern: /./, value: "" },
      { name: "mouth", label: "Mouth", pattern: /./, value: "" },
      { name: "skin", label: "Skin", pattern: /./, value: "" },
      { name: "cardiac", label: "Cardiac", pattern: /./, value: "" },
      { name: "respiratory", label: "Respiratory", pattern: /./, value: "" },
      { name: "abdominal", label: "Abdominal", pattern: /./, value: "" },
      { name: "musculoskeletal", label: "Musculoskeletal", pattern: /./, value: "" },
      { name: "neurological", label: "Neurological", pattern: /./, value: "" },
      { name: "assessment", label: "Assessment", pattern: /./, value: "" },
      { name: "treatmentPlan", label: "Treatment Plan", pattern: /./, value: "" }
    ]
  }
];

interface Pet {
  id: string;
  name: string;
  species: string;
  breed: string;
  age?: string;
  owner: string;
}

interface Clinic {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
}

interface RecordingInterfaceProps {
  onSave?: (transcription: {
    text: string;
    format: string;
    petId?: string;
    clinicId?: string;
    visitType?: string;
    templateId?: string;
  }) => void;
}

const RecordingInterface: React.FC<RecordingInterfaceProps> = ({
  onSave = () => {},
}) => {
  const { isAuthenticated, getToken } = useAuth();
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [format, setFormat] = useState("raw");
  const [transcriptionText, setTranscriptionText] = useState("");
  const [editableText, setEditableText] = useState("");
  const [templateText, setTemplateText] = useState("");
  const [speechText, setSpeechText] = useState("");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState("");
  const [isTranscribingUpload, setIsTranscribingUpload] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [selectedPet, setSelectedPet] = useState<string>("");
  const [selectedClinic, setSelectedClinic] = useState<string>("");
  const [visitType, setVisitType] = useState<string>("");
  const [pets, setPets] = useState<Pet[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [isPetsLoading, setIsPetsLoading] = useState(true);
  const [isClinicsLoading, setIsClinicsLoading] = useState(true);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<VisitTypeTemplate | null>(null);
  const [templateFields, setTemplateFields] = useState<TemplateField[]>([]);
  const [searchParams] = useSearchParams();
  const [recordingUUID, setRecordingUUID] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);

  const timerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [waveformData, setWaveformData] = useState<number[]>(Array(50).fill(5));

  const visitTypes = [
    "Annual Checkup", "Vaccination", "Illness", "Injury", 
    "Surgery Follow-up", "Dental Cleaning", "Emergency", "Other"
  ];
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';
const API_URL = `${API_BASE}/api`;
const TRANSCRIBE_API_URL = `${API_BASE}/api/transcribe`;

  useEffect(() => {
    const generateUUID = () => {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
        const r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };
    setRecordingUUID(generateUUID());
  }, []);

  // Fetch pets from database
  useEffect(() => {
    const fetchPets = async () => {
      try {
        setIsPetsLoading(true);
        const token = localStorage.getItem('auth_token');
        
        if (!token) {
          console.error('No auth token found');
          setIsPetsLoading(false);
          return;
        }

        const response = await fetch(`${API_BASE}/api/pets`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const petsData = await response.json();
          setPets(petsData);
        } else {
          console.error('Failed to fetch pets');
        }
      } catch (error) {
        console.error('Error fetching pets:', error);
      } finally {
        setIsPetsLoading(false);
      }
    };

    if (isAuthenticated) {
      fetchPets();
    }
  }, [isAuthenticated]);

  // Fetch clinics from database
  useEffect(() => {
    const fetchClinics = async () => {
      try {
        setIsClinicsLoading(true);
        const token = localStorage.getItem('auth_token');
        
        if (!token) {
          console.error('No auth token found');
          setIsClinicsLoading(false);
          return;
        }

        const response = await fetch(`${API_BASE}/api/clinics`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const clinicsData = await response.json();
          setClinics(clinicsData);
        } else {
          console.error('Failed to fetch clinics');
        }
      } catch (error) {
        console.error('Error fetching clinics:', error);
      } finally {
        setIsClinicsLoading(false);
      }
    };

    if (isAuthenticated) {
      fetchClinics();
    }
  }, [isAuthenticated]);

 // Improved field detection function
const parseTemplateFields = (transcript: string, fields: TemplateField[]): TemplateField[] => {
  const updatedFields = fields.map((f) => ({ ...f }));
  
  if (!transcript.trim()) return updatedFields;

  const lowerTranscript = transcript.toLowerCase();
  
  console.log("🎯 Field Detection Started...");
  console.log("Transcript:", transcript);
  console.log("Fields to detect:", fields.map(f => f.label));

  for (const field of updatedFields) {
    // Agar pehle se value hai to skip karo
    if (field.value && field.value.trim()) continue;

    const label = field.label.toLowerCase();
    let fieldValue = '';
    
    console.log(`\n🔍 Checking field: ${field.label}`);

    // Method 1: Direct colon pattern (e.g., "Age: 5 years")
    const colonPattern = new RegExp(`${escapeRegExp(field.label)}\\s*:\\s*([^\\n.!?]+)`, 'gi');
    const colonMatch = colonPattern.exec(transcript);
    if (colonMatch && colonMatch[1]) {
      fieldValue = colonMatch[1].trim();
      console.log(`✅ Colon pattern matched: ${fieldValue}`);
    }

    // Method 2: Smart field extraction for common medical fields
    if (!fieldValue) {
      fieldValue = smartFieldExtraction(transcript, field.name, field.label);
      if (fieldValue) {
        console.log(`✅ Smart extraction matched: ${fieldValue}`);
      }
    }

    // Method 3: Enhanced direct extraction
    if (!fieldValue) {
      fieldValue = enhancedFieldExtraction(transcript, field.name, field.label);
      if (fieldValue) {
        console.log(`✅ Enhanced extraction matched: ${fieldValue}`);
      }
    }

    // Method 4: Context-based extraction
    if (!fieldValue) {
      fieldValue = contextBasedExtraction(transcript, field.name, field.label);
      if (fieldValue) {
        console.log(`✅ Context-based extraction matched: ${fieldValue}`);
      }
    }

    // Validate and set the value
    if (fieldValue && 
        fieldValue.length > 0 && 
        fieldValue.length < 100 && 
        !fieldValue.toLowerCase().includes(field.label.toLowerCase())) {
      field.value = fieldValue;
      console.log(`🎉 Field ${field.label} set to: ${fieldValue}`);
    } else {
      console.log(`❌ No value found for: ${field.label}`);
    }
  }

  console.log("📊 Final detected fields:", updatedFields.filter(f => f.value));
  return updatedFields;
};

// Enhanced field extraction with better word detection
const enhancedFieldExtraction = (transcript: string, fieldName: string, label: string): string => {
  const lowerTranscript = transcript.toLowerCase();
  const lowerLabel = label.toLowerCase();

  // Multiple patterns to try
  const patterns = [
    // Pattern 1: "label value" (e.g., "age five years")
    new RegExp(`${escapeRegExp(lowerLabel)}\\s+([^.!?\\n:]{1,50}?)(?=\\s+[A-Z][a-z]+:|\\s*$|[.!?\\n])`, 'i'),
    
    // Pattern 2: "label is value" (e.g., "age is five years")
    new RegExp(`${escapeRegExp(lowerLabel)}\\s+is\\s+([^.!?\\n:]{1,50}?)(?=\\s+[A-Z][a-z]+:|\\s*$|[.!?\\n])`, 'i'),
    
    // Pattern 3: "label - value" (e.g., "age - five years")
    new RegExp(`${escapeRegExp(lowerLabel)}\\s*-\\s*([^.!?\\n:]{1,50}?)(?=\\s+[A-Z][a-z]+:|\\s*$|[.!?\\n])`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);
    if (match && match[1]) {
      let value = match[1].trim();
      
      // Clean up the value
      value = value.replace(/^[,\-\s]+|[,\-\s]+$/g, ''); // Remove leading/trailing punctuation
      
      if (value && value.length > 0 && !value.toLowerCase().includes(lowerLabel)) {
        console.log(`🔍 Pattern matched for ${label}: "${value}"`);
        return value;
      }
    }
  }

  return '';
};

// Context-based extraction for medical fields
const contextBasedExtraction = (transcript: string, fieldName: string, label: string): string => {
  const lowerTranscript = transcript.toLowerCase();
  const lowerLabel = label.toLowerCase();

  // Common context words for different field types
  const contextPatterns: Record<string, RegExp[]> = {
    // Physical exam fields
    eyes: [/eyes?\s+(?:are|is|looks?|appears?)\s+([^.!?]{1,30})/gi],
    ears: [/ears?\s+(?:are|is|looks?|appears?)\s+([^.!?]{1,30})/gi],
    nose: [/nose\s+(?:is|looks?|appears?)\s+([^.!?]{1,30})/gi],
    mouth: [/mouth\s+(?:is|looks?|appears?)\s+([^.!?]{1,30})/gi],
    skin: [/skin\s+(?:is|looks?|appears?)\s+([^.!?]{1,30})/gi],
    cardiac: [/heart\s+(?:sounds?|is|appears?)\s+([^.!?]{1,30})/gi],
    respiratory: [/breathing\s+(?:is|sounds?)\s+([^.!?]{1,30})/gi],
    abdominal: [/abdomen\s+(?:is|feels?)\s+([^.!?]{1,30})/gi],
    
    // Assessment and plan
    assessment: [/(?:diagnos(?:is|es)|assessment|findings?)\s+(?:is|are)\s+([^.!?]{1,50})/gi],
    plan: [/(?:plan|treatment|recommendations?)\s+(?:is|are)\s+([^.!?]{1,50})/gi],
    treatmentPlan: [/(?:treat|prescribe|recommend)\s+([^.!?]{1,50})/gi],
    
    // Subjective and objective
    subject: [/(?:owner\s+says|client\s+reports|history)\s+([^.!?]{1,80})/gi],
    object: [/(?:examination\s+shows|findings|observed)\s+([^.!?]{1,80})/gi],
  };

  if (contextPatterns[fieldName]) {
    for (const pattern of contextPatterns[fieldName]) {
      const match = lowerTranscript.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  }

  return '';
};

// Improved smart field extraction for common medical fields
const smartFieldExtraction = (transcript: string, fieldName: string, label: string): string => {
  const lowerTranscript = transcript.toLowerCase();
  
  // Common patterns for medical fields
  const patterns: Record<string, RegExp[]> = {
    age: [
      /age\s*(?:is|:)?\s*(\d+(?:\s*(?:years?|yrs?|months?|mos?|weeks?|wks?|days?))?)/i,
      /(\d+(?:\s*(?:years?|yrs?|months?|mos?|weeks?|wks?|days?))?)\s*old/i,
      /age\s+of\s+(\d+)/i
    ],
    temperature: [
      /temperature\s*(?:is|:)?\s*(\d+(?:\.\d+)?\s*(?:°?F|°?C|degrees?)?)/i,
      /temp\s*(?:is|:)?\s*(\d+(?:\.\d+)?)/i,
      /fever\s+of\s+(\d+(?:\.\d+)?)/i
    ],
    heartRate: [
      /heart\s*rate\s*(?:is|:)?\s*(\d+(?:\s*bpm)?)/i,
      /HR\s*(?:is|:)?\s*(\d+)/i,
      /pulse\s*(?:is|:)?\s*(\d+)/i,
      /heart\s+beat\s+(\d+)/i
    ],
    respiratoryRate: [
      /respiratory\s*rate\s*(?:is|:)?\s*(\d+(?:\s*bpm)?)/i,
      /RR\s*(?:is|:)?\s*(\d+)/i,
      /breathing\s*(?:is|:)?\s*(\d+)/i,
      /respiration\s+(\d+)/i
    ],
    weight: [
      /weight\s*(?:is|:)?\s*(\d+(?:\.\d+)?\s*(?:kg|kgs|kilograms?|lb|lbs|pounds?)?)/i,
      /wt\s*(?:is|:)?\s*(\d+(?:\.\d+)?)/i,
      /weighs?\s+(\d+(?:\.\d+)?)/i
    ],
    petName: [
      /(?:pet|patient|animal)\s+(?:name|is)\s+([a-zA-Z]{2,20})/i,
      /(?:called|named)\s+([a-zA-Z]{2,20})/i
    ],
    species: [
      /(?:species|type)\s+(?:is|:)?\s+([a-zA-Z]{3,15})/i,
      /(?:dog|cat|bird|rabbit|hamster|guinea\s+pig)/i
    ],
    breed: [
      /breed\s+(?:is|:)?\s+([a-zA-Z\s]{3,30})/i,
      /(?:golden retriever|siamese|beagle|persian|labrador)/i
    ]
  };

  // Check if we have specific patterns for this field
  if (patterns[fieldName]) {
    for (const pattern of patterns[fieldName]) {
      const match = transcript.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();
        console.log(`🎯 Smart pattern matched for ${fieldName}: "${value}"`);
        return value;
      }
    }
  }

  return '';
};

// Better escape function
const escapeRegExp = (s: string) => {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
const extractFieldValue = (transcript: string, fieldName: string, label: string): string => {
  const lowerTranscript = transcript.toLowerCase();
  const lowerLabel = label.toLowerCase();

  const labelIndex = lowerTranscript.indexOf(lowerLabel);
  if (labelIndex === -1) return '';

  const afterLabel = transcript.slice(labelIndex + label.length);
 
  const words = afterLabel.trim().split(/\s+/);
  const valueWords = [];
  
  for (let i = 0; i < Math.min(words.length, 5); i++) { 
    const word = words[i];
  
    if (/[.!?\n]/.test(word) || 
        word.endsWith(':') ||
        word.length > 20) { 
      break;
    }
    valueWords.push(word);
  }

  const potentialValue = valueWords.join(' ').replace(/[,:.]$/, '').trim();

  if (potentialValue && 
      potentialValue.length > 0 && 
      potentialValue.length < 50 &&
      !potentialValue.toLowerCase().includes(lowerLabel)) {
    return potentialValue;
  }

  return '';
};

  // const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const resetFieldValues = () => {
    if (selectedTemplate) {
      setTemplateFields(selectedTemplate.fields.map(field => ({...field, value: ""})));
    }
  };

  const generateFilledTemplate = (template: string, fields: TemplateField[]): string => {
      let filledTemplate = template;
      
      fields.forEach(field => {
        const placeholder = `{${field.name}}`;
        // Use split/join instead of replaceAll for broader TS lib compatibility
        filledTemplate = filledTemplate.split(placeholder).join(field.value || "");
      });
      
     
      if (fields.some(f => f.value)) {
        const lines = filledTemplate.split(/\r?\n/);
        const updatedLines = lines.map((line) => {
          for (const field of fields) {
            if (!field.value) continue;
            const placeholder = `{${field.name}}`;
            // Skip if the template already used the placeholder
            if (filledTemplate.includes(placeholder)) continue;
            const labelPattern = new RegExp(`^\\s*${escapeRegExp(field.label)}\\s*:\\s*$`, 'i');
            if (labelPattern.test(line)) {
              return `${field.label}: ${field.value}`;
            }
          }
          return line;
        });
        filledTemplate = updatedLines.join("\n");
      }
      
      const pet = pets.find((p) => p.id === selectedPet);
      const clinic = clinics.find((c) => c.id === selectedClinic);
      
      return filledTemplate
        .replace(/\{PET_NAME\}/g, pet?.name || "")
        .replace(/\{OWNER_NAME\}/g, pet?.owner || "")
        .replace(/\{CLINIC_NAME\}/g, clinic?.name || "")
        .replace(/\{VISIT_TYPE\}/g, visitType || "")
        .replace(/\{DATE\}/g, new Date().toLocaleDateString()).replace(/\{date\}/g, new Date().toLocaleDateString());
    };

 useEffect(() => {
  if (selectedTemplate) {
    const newTemplateText = generateFilledTemplate(selectedTemplate.template, templateFields);
    setTemplateText(newTemplateText);

    if (isRecording) {
      const notesSection = transcript.trim() ? `\n\n--- NOTES ---\n${transcript}` : '';
      setEditableText(newTemplateText + notesSection);
    } 
 
    else if (transcriptionResult) {
      const notesSection = `\n\n--- NOTES ---\n${transcriptionResult}`;
      setEditableText(newTemplateText + notesSection);
    } 
 
    else {
      setEditableText(newTemplateText);
    }
  } else {
    setTemplateText("");
  
    if (isRecording) {
      setEditableText(transcript);
    } 
     
    else if (transcriptionResult) {
      setEditableText(transcriptionResult);
    } 

    else {
      setEditableText("");
    }
  }
}, [selectedTemplate, selectedPet, selectedClinic, visitType, templateFields, transcript, transcriptionResult, isRecording]);
  
  const buildFieldsFromTemplate = (tpl: string): TemplateField[] => {
    const lines = tpl.split(/\r?\n/);
   
    const labelRegex = /^\s*([A-Za-z][A-Za-z0-9 _-]{0,40})\s*:\s*(.*)?$/;
    const seen = new Set<string>();

    const toCamel = (s: string) =>
      s
        .trim()
        .replace(/[_\s-]+(.)/g, (_, c) => c.toUpperCase())
        .replace(/^[A-Z]/, (c) => c.toLowerCase());

    const fields: TemplateField[] = [];
    for (const line of lines) {
      const m = line.match(labelRegex);
      if (m) {
        const label = m[1].trim();
        const name = toCamel(label);
        if (!seen.has(name)) {
          seen.add(name);
          fields.push({
            name,
            label,
            pattern: /./,
            value: ""
          });
        }
      }
    }
    return fields;
  };

 useEffect(() => {
  if (isRecording && selectedTemplate) {
    setSpeechText(transcript);

    const timeoutId = setTimeout(() => {
      const updatedFields = parseTemplateFields(transcript, templateFields);
      setTemplateFields(updatedFields);
      
      const filledTemplate = generateFilledTemplate(selectedTemplate.template, updatedFields);

      const notesSection = transcript.trim() ? `\n\n--- NOTES ---\n${transcript}` : '';
      setEditableText(filledTemplate + notesSection);
    }, 500);

    return () => clearTimeout(timeoutId);
  } else if (isRecording) {
    setSpeechText(transcript);
    setEditableText(transcript);
  }

  setHasContent(!!transcript || !!editableText || !!transcriptionResult);
}, [transcript, isRecording, editableText, transcriptionResult]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioStreamRef.current && audioContextRef.current) {
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 128;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const source = audioContextRef.current.createMediaStreamSource(audioStreamRef.current);
        source.connect(analyser);
        analyserRef.current = analyser;
        updateWaveform();
      }
    }
    return () => {
      if (audioContextRef.current?.state !== "closed") {
        audioContextRef.current?.close();
      }
    };
  }, [isRecording, isPaused]);

  const updateWaveform = () => {
    if (!isRecording || isPaused || !analyserRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    analyserRef.current.getByteFrequencyData(dataArray);
    
    const newWaveformData = Array(50).fill(0);
    const step = Math.floor(dataArray.length / 50);
    
    for (let i = 0; i < 50; i++) {
      const index = i * step;
      if (index < dataArray.length) {
        newWaveformData[i] = (dataArray[index] / 255) * 80;
      }
    }
    
    setWaveformData(newWaveformData);
    requestAnimationFrame(updateWaveform);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setAudioUrl(URL.createObjectURL(file));
      setIsRecording(false);
      setIsPaused(false);
      setRecordingTime(0);
      resetTranscript();
      setTranscriptionResult("");
      setHasContent(true);
    }
  };

  const toggleAudioPlayback = () => {
    if (audioRef.current) {
      if (isAudioPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsAudioPlaying(!isAudioPlaying);
    }
  };

  const uploadAudioFile = async (file: File): Promise<string | null> => {
    if (!file) return null;
    
    try {
      const formData = new FormData();
      formData.append('audio', file);
      
      
       const token = localStorage.getItem('auth_token');
     const response = await fetch(`${API_URL}/audio-files/upload`,{
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Audio upload failed');
      }
      
      const result = await response.json();
      return result.audioFile?.url || null; 
    } catch (error) {
      console.error('Audio upload error:', error);
      return null;
    }
  };

  const transcribeAudioFile = async () => {
  if (!audioFile) return;
  
  setIsTranscribingUpload(true);
  setUploadProgress(0);
  setTranscriptionResult("");
  
  try {
    setUploadProgress(30);
    const uploadedAudioUrl = await uploadAudioFile(audioFile);
    
    if (!uploadedAudioUrl) {
      throw new Error('Audio file upload failed');
    }

    setUploadProgress(60);
    const formData = new FormData();
    formData.append('audio', audioFile);

    const transcriptionText = await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
     xhr.open('POST', TRANSCRIBE_API_URL);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(60 + Math.round((e.loaded / e.total) * 30));
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const json = JSON.parse(xhr.responseText);
            resolve(json.text || '');
          } catch (err) {
            reject(new Error('Invalid JSON response from server'));
          }
        } else {
          reject(new Error(`Server error: ${xhr.status} ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(formData);
    });
    let finalText = transcriptionText;
    let detectedFields: TemplateField[] = [];
    
    if (selectedTemplate) {
      detectedFields = parseTemplateFields(transcriptionText, selectedTemplate.fields);
      setTemplateFields(detectedFields);
      const filledTemplate = generateFilledTemplate(selectedTemplate.template, detectedFields);
      
      const notesSection = transcriptionText.trim() ? `\n\n--- NOTES ---\n${transcriptionText}` : '';
      finalText = filledTemplate + notesSection;
    } else {
      finalText = `--- NOTES ---\n${transcriptionText}`;
    }
    
    setEditableText(finalText);
    setTranscriptionResult(transcriptionText);
    setTranscriptionText(finalText);
    setUploadProgress(100);
    setHasContent(true);

    await saveTranscriptionAsCallRecording(finalText, transcriptionText, uploadedAudioUrl);
    
  } catch (err: any) {
    setTranscriptionResult(`❌ Transcription failed: ${err.message}`);
  } finally {
    setIsTranscribingUpload(false);
  }
};
  const saveTranscriptionAsCallRecording = async (fullText: string, rawTranscription: string, audioUrl: string) => {
    if (!isAuthenticated) {
      console.log('User not authenticated, skipping auto-save');
      return;
    }

  const token = localStorage.getItem('auth_token');
    if (!token) {
      console.log('No authentication token found');
      return;
    }

    const pet = selectedPet ? pets.find(p => p.id === selectedPet) : null;
    const clinic = selectedClinic ? clinics.find(c => c.id === selectedClinic) : null;

    const transcriptionData = {
      title: selectedTemplate 
        ? `${selectedTemplate.name} - ${pet?.name || ''}`
        : `${pet?.name || 'Audio Recording'} - ${visitType || 'Call'}`,
      content: fullText,
      category: 'Call Recording',
      petName: pet?.name,
      clinicName: clinic?.name,
      visitType: visitType,
      templateName: selectedTemplate?.name,
      recordingDuration: Math.floor(audioRef.current?.duration || 0),
      audioUrl: audioUrl,
      isCallRecording: true
    };

    try {
     const response = await fetch(`${API_URL}/transcriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(transcriptionData)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      
      const result = await response.json();
      console.log('Audio transcription saved with audio URL:', result);
    
      
    } catch (error: any) {
      console.error('Failed to save transcription with audio:', error);
      alert(`Failed to save transcription: ${error.message}`);
    }
  };

  const handleTemplateSelect = (template: VisitTypeTemplate | any) => {
    const derivedFields: TemplateField[] =
      Array.isArray(template.fields) && template.fields.length
        ? template.fields
        : buildFieldsFromTemplate(template.template || "");
    const normalizedTemplate: VisitTypeTemplate = {
      id: String(template.id ?? template.name ?? Date.now()),
      name: String(template.name ?? "Untitled"),
      description: template.description,
      template: String(template.template ?? ""),
      fields: derivedFields
    };
  
    setSelectedTemplate(normalizedTemplate);
    setTemplateFields(derivedFields.map((f) => ({ ...f, value: "" })));
    setIsTemplateDialogOpen(false);
  
    if (normalizedTemplate.name.toLowerCase().includes("soap")) {
      setFormat("soap");
    } else if (normalizedTemplate.name.toLowerCase().includes("medical")) {
      setFormat("medical");
    } else {
      setFormat("raw");
    }
    const initialTemplate = generateFilledTemplate(normalizedTemplate.template, derivedFields);
    setTemplateText(initialTemplate);
  
    if (transcriptionResult) {
      setEditableText(`${initialTemplate}\n\n--- NOTES ---\n${transcriptionResult}`);
    } else {
      setEditableText(initialTemplate);
    }
  
    setHasContent(true);
  };

  const clearTemplate = () => {
    setSelectedTemplate(null);
    setTemplateFields([]);
    setTemplateText("");
    setFormat("raw"); 

    if (transcriptionResult) {
      setEditableText(transcriptionResult);
    } else {
      setEditableText("");
    }
    
    setHasContent(!!transcriptionResult);
  };

  

  const pauseRecording = () => {
    SpeechRecognition.stopListening();
    setIsPaused(true);
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const resumeRecording = () => {
    SpeechRecognition.startListening({ continuous: true });
    setIsPaused(false);
    timerRef.current = window.setInterval(() => {
      setRecordingTime((prev) => prev + 1);
      setHasContent(true);
    }, 1000);
  };


  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  };


const saveAudioRecordingToServer = async (audioBlob: Blob): Promise<string | null> => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      console.log('No authentication token found');
      return null;
    }

    // Create FormData for audio file
    const formData = new FormData();
    const audioFile = new File([audioBlob], `recording_${Date.now()}.webm`, { 
      type: 'audio/webm' 
    });
    formData.append('audio', audioFile);

    // Upload audio file to the new endpoint
    const uploadResponse = await fetch(`${API_URL}/audio-files/save-recording`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!uploadResponse.ok) {
      throw new Error('Audio upload failed');
    }

    const uploadResult = await uploadResponse.json();
    return uploadResult.audioFile?.url || null;
    
  } catch (error) {
    console.error('Error saving audio recording:', error);
    return null;
  }
};

const stopRecording = async () => {
  SpeechRecognition.stopListening();
  setIsRecording(false);
  setIsPaused(false);
  
  if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
    mediaRecorderRef.current.stop();
  }
  
  if (audioStreamRef.current) {
    audioStreamRef.current.getTracks().forEach((track) => track.stop());
  }
  
  if (timerRef.current) {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }
  await saveAudioRecording();
  if (selectedTemplate) {
    const filledTemplate = generateFilledTemplate(selectedTemplate.template, templateFields);
    const notesSection = transcript.trim() ? `\n\n--- NOTES ---\n${transcript}` : '';
    const finalText = filledTemplate + notesSection;
    
    setTranscriptionText(finalText);
    setEditableText(finalText);
    setTranscriptionResult(transcript);
  } else {
  
    setTranscriptionText(transcript);
    setEditableText(transcript);
    setTranscriptionResult(transcript);
  }
  
  setHasContent(true);
};

const startRecording = async () => {
    // Validate required fields
    if (!selectedPet) {
      alert('Please select a pet before recording');
      return;
    }
    if (!selectedClinic) {
      alert('Please select a clinic before recording');
      return;
    }
    if (!visitType) {
      alert('Please select a visit type before recording');
      return;
    }
    
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100,
      } 
    });

    const options = {
      mimeType: 'audio/mp3',
      audioBitsPerSecond: 128000
    };
    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/mp3')) {
      mimeType = 'audio/mp3';
    } else if (MediaRecorder.isTypeSupported('audio/mpeg')) {
      mimeType = 'audio/mpeg';
    }
    
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: mimeType
    });
    
    mediaRecorderRef.current = mediaRecorder;
    audioChunksRef.current = [];
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      console.log('Recording stopped, audio chunks:', audioChunksRef.current.length);
    };
    mediaRecorder.start(1000); 

    await SpeechRecognition.startListening({ continuous: true });
    
    setIsRecording(true);
    setIsPaused(false);
    setPermissionDenied(false);
    setAudioFile(null);
    setAudioUrl(null);
    setHasContent(true);
    
    timerRef.current = window.setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
    
  } catch (error) {
    console.error("Error accessing microphone:", error);
    setPermissionDenied(true);
  }
};

const saveAudioRecording = async () => {
  try {
    if (!transcript || transcript.trim() === '') {
      console.log('No transcript to save with audio');
      return;
    }

   const token = localStorage.getItem('auth_token');
    if (!token) {
      console.log('No authentication token found');
      return;
    }

    let audioFileUrl = null;
    if (audioChunksRef.current.length > 0) {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      audioFileUrl = await saveAudioRecordingToServer(audioBlob);
    }

    const pet = selectedPet ? pets.find(p => p.id === selectedPet) : null;
    const clinic = selectedClinic ? clinics.find(c => c.id === selectedClinic) : null;

    const recordingData = {
      title: selectedTemplate 
        ? `${selectedTemplate.name} - ${pet?.name || 'Live Recording'}`
        : `${pet?.name || 'Live Recording'} - ${visitType || 'Call'}`,
      content: transcript,
      category: 'Call Recording',
      petName: pet?.name,
      clinicName: clinic?.name,
      visitType: visitType,
      templateName: selectedTemplate?.name,
      recordingDuration: recordingTime,
      audioUrl: audioFileUrl, 
      isCallRecording: true
    };

    const response = await fetch(`${API_URL}/transcriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(recordingData)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to save recording: ${errorText}`);
    }
    
    const result = await response.json();
    console.log('Live recording saved successfully:', result);
    
  } catch (error) {
    console.error('Error saving audio recording:', error);
  }
};

const saveAudioFileToDatabase = async () => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      return;
    }
    const audioFileData = {
      name: `recording_${Date.now()}.wav`,
      type: 'audio/wav',
      size: 0, 
      duration: recordingTime,
      content: transcript 
    };

    const response = await fetch(`${API_URL}/audio-files/upload-live`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(audioFileData)
    });

    if (response.ok) {
      console.log('Audio file record created for live recording');
    }
  } catch (error) {
    console.error('Error creating audio file record:', error);
  }
};
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditableText(e.target.value);
    setTranscriptionText(e.target.value);
    setHasContent(!!e.target.value);
  };

  const debugStateBeforeSave = () => {
    console.log("=== DEBUG STATE BEFORE SAVE ===");
    console.log("transcriptionText:", transcriptionText);
    console.log("editableText:", editableText);
    console.log("speechText:", speechText);
    console.log("templateText:", templateText);
    console.log("isRecording:", isRecording);
    console.log("isPaused:", isPaused);
    console.log("transcript (from speech recognition):", transcript);
    console.log("=================================");
  };

 const saveTranscription = async () => {
  debugStateBeforeSave();
  
  // Validate required fields
  if (!selectedPet) {
    alert('Please select a pet before saving');
    return;
  }
  if (!selectedClinic) {
    alert('Please select a clinic before saving');
    return;
  }
  if (!visitType) {
    alert('Please select a visit type before saving');
    return;
  }
  
  if (!isAuthenticated) {
    alert('Please login to save transcriptions');
    return;
  }

  const token = localStorage.getItem('auth_token');
  if (!token) {
    alert('Authentication token not found. Please login again.');
    return;
  }

  const formatToCategoryMap: Record<string, string> = {
    'soap': 'SOAP',
    'medical': 'Medical Notes', 
    'raw': 'Raw Text',
    'SOAP': 'SOAP',
    'Medical Notes': 'Medical Notes',
    'Raw Text': 'Raw Text',
    'Annual Checkup': 'Annual Checkup',
    'Call Recording': 'Call Recording',
    'Others': 'Others'
  };
  
  let category = "Raw Text";
  if (selectedTemplate) {
    if (selectedTemplate.name.toLowerCase().includes("soap")) {
      category = "SOAP";
    } else if (selectedTemplate.name.toLowerCase().includes("medical")) {
      category = "Medical Notes";
    } else if (selectedTemplate.name.toLowerCase().includes("annual")) {
      category = "Annual Checkup";
    } else {
      category = formatToCategoryMap[format] || "Others";
    }
  } else {
    category = formatToCategoryMap[format] || "Raw Text";
  }
  
  const pet = selectedPet ? pets.find(p => p.id === selectedPet) : null;
  const clinic = selectedClinic ? clinics.find(c => c.id === selectedClinic) : null;
  
  if (!transcriptionText || transcriptionText.trim() === '') {
    alert('Transcription content is required');
    return;
  }

  // ✅ FIX: Remove isCallRecording field temporarily
  const transcriptionData = {
    title: selectedTemplate 
      ? `${selectedTemplate.name} - ${pet?.name || ''}`
      : `${pet?.name || 'Untitled'} - ${visitType || 'Raw Text Note'}`,
    content: transcriptionText,
    category: category,
    petName: pet?.name,
    clinicName: clinic?.name,
    visitType: visitType,
    templateName: selectedTemplate?.name,
    recordingDuration: recordingTime,
    audioUrl: audioUrl
    // ❌ REMOVE: isCallRecording: !!audioUrl 
  };

  console.log('🎯 Sending data (without is_call_recording):', transcriptionData);

  try {
    const response = await fetch(`${API_URL}/transcriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(transcriptionData)
    });
    
    console.log('🔍 Response Status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Server Error:', errorText);
      let errorMessage = 'Failed to save transcription';
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    console.log('✅ Success:', result);
    
    const existingTranscriptions = JSON.parse(localStorage.getItem('transcriptions') || '[]');
    const newTranscription = {
      id: result.transcription?.id || Date.now().toString(),
      title: transcriptionData.title,
      content: transcriptionData.content,
      format: category,
      date: new Date(),
      petName: pet?.name,
      clinicName: clinic?.name,
      ownerName: pet?.owner,
      visitType: visitType,
      recordingDuration: recordingTime
    };
    
    localStorage.setItem('transcriptions', JSON.stringify([
      ...existingTranscriptions,
      newTranscription
    ]));

    resetAllStates();
    alert("Transcription saved successfully to database!");
    
  } catch (error: any) {
    console.error("Error saving transcription:", error);
    alert(`Failed to save transcription: ${error.message}`);
  }
};
  const resetAllStates = () => {
    setRecordingTime(0);
    setTranscriptionText("");
    setEditableText("");
    setTemplateText("");
    setSpeechText("");
    setSelectedPet(undefined);
    setSelectedClinic(undefined);
    setVisitType("");
    setSelectedTemplate(null);
    setTemplateFields([]);
    setAudioFile(null);
    setAudioUrl(null);
    setIsSaveDialogOpen(false);
    setIsEditMode(false);
    setHasContent(false);
    setTranscriptionResult("");
    resetTranscript();
  };

  const discardTranscription = () => {
    resetAllStates();
    setIsDiscardDialogOpen(false);
  };


  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };
  const TemplateSelection = () => (
    <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={isRecording}
          className="flex items-center gap-2 max-w-full sm:max-w-none overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileText size={16} />
          {selectedTemplate ? "Change Template" : "Select Template"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select a Template</DialogTitle>
          <DialogDescription>
            Choose a template to use for your transcription
          </DialogDescription>
        </DialogHeader>
        <VisitTypeTemplatesList onSelectTemplate={handleTemplateSelect} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Auto-select template when coming from Templates page with ?templateId=...
  useEffect(() => {
    const templateId = searchParams.get("templateId");
    if (!templateId || selectedTemplate) return;

    const tpl = VisitTypeTemplates.find((t) => t.id === templateId);
    if (tpl) {
      handleTemplateSelect(tpl);
    }
  }, [searchParams, selectedTemplate]);

  return (
    <div className="bg-gradient-to-br from-[#f0f4ff] via-[#e8faff] to-[#fef6e4] p-6 rounded-xl shadow-md mt-10 mr-5">
      <div className="space-y-8">
        <motion.div variants={fadeInUp} initial="hidden" animate="show">
          <Card className="bg-white/80 backdrop-blur-lg shadow-xl border border-gray-200 rounded-2xl transition-all">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-gray-800">
                Visit Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="pet-select">Pet *</Label>
                  <Select value={selectedPet} onValueChange={setSelectedPet} disabled={isRecording} required>
                    <SelectTrigger id="pet-select" className="w-full">
                      <SelectValue placeholder="Select pet" />
                    </SelectTrigger>
                    <SelectContent>
                      {isPetsLoading ? (
                        <SelectItem value="loading" disabled>Loading pets...</SelectItem>
                      ) : pets.length === 0 ? (
                        <SelectItem value="none" disabled>No pets available</SelectItem>
                      ) : (
                        pets.map((pet) => (
                          <SelectItem key={pet.id} value={pet.id}>
                            {pet.name} ({pet.species})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {selectedPet && (
                    <p className="text-sm text-gray-500 mt-1">
                      {pets.find((p) => p.id === selectedPet)?.breed}, Owner:{" "}
                      {pets.find((p) => p.id === selectedPet)?.owner}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clinic-select">Clinic *</Label>
                  <Select value={selectedClinic} onValueChange={setSelectedClinic} disabled={isRecording} required>
                    <SelectTrigger id="clinic-select" className="w-full">
                      <SelectValue placeholder="Select clinic" />
                    </SelectTrigger>
                    <SelectContent>
                      {isClinicsLoading ? (
                        <SelectItem value="loading" disabled>Loading clinics...</SelectItem>
                      ) : clinics.length === 0 ? (
                        <SelectItem value="none" disabled>No clinics available</SelectItem>
                      ) : (
                        clinics.map((clinic) => (
                          <SelectItem key={clinic.id} value={clinic.id}>
                            {clinic.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {selectedClinic && (
                    <p className="text-sm text-gray-500 mt-1">
                      {clinics.find((c) => c.id === selectedClinic)?.address},{" "}
                      {clinics.find((c) => c.id === selectedClinic)?.city}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="visit-type">Visit Type *</Label>
                  <Select value={visitType} onValueChange={setVisitType} disabled={isRecording} required>
                    <SelectTrigger id="visit-type">
                      <SelectValue placeholder="Select visit type" />
                    </SelectTrigger>
                    <SelectContent>
                      {visitTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={fadeInUp} initial="hidden" animate="show">
          <Card className="bg-white/80 backdrop-blur-lg shadow-xl border border-gray-200 rounded-2xl transition-all">
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>Audio Recording</span>
                <div className="text-sm font-normal bg-[#E6EFFF] px-3 py-1 rounded-full">
                  {formatTime(recordingTime)}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col space-y-4">
                <div className="flex items-center justify-between">
                  <TemplateSelection />
                  {selectedTemplate && (
                    <Button variant="outline" size="sm" onClick={resetFieldValues} className="ml-2">
                      Reset Fields
                    </Button>
                  )}
                </div>

                {selectedTemplate && (
                  <div className="flex items-center justify-between bg-muted/30 p-2 rounded-md">
                    <div>
                      <span className="text-sm font-medium">Selected Template: </span>
                      <span className="text-sm">{selectedTemplate.name}</span>
                      {selectedTemplate.description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {selectedTemplate.description}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={clearTemplate}>
                      Clear
                    </Button>
                  </div>
                )}
                {selectedTemplate && templateFields.length > 0 && (isRecording || transcriptionResult) && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-md">
                    <h4 className="font-medium text-sm mb-2">Detected Fields:</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {templateFields.slice(0, 6).map((field, index) => (
                        <div key={index} className={`p-2 rounded text-xs ${
                          field.value ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          <span className="font-medium">{field.label}:</span>
                          {field.value ? ` ${field.value}` : ' Not detected'}
                        </div>
                      ))}
                      {templateFields.length > 6 && (
                        <div className="p-2 rounded text-xs bg-blue-100 text-blue-800">
                          +{templateFields.length - 6} more fields
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-blue-600">
                      <p>Detected from {isRecording ? 'live recording' : 'uploaded audio'}</p>
                    </div>
                  </div>
                )}

                {audioUrl && (
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                      <audio
                        ref={audioRef}
                        src={audioUrl}
                        onEnded={() => setIsAudioPlaying(false)}
                        hidden
                      />
                      <Button
                        variant="outline"
                        onClick={toggleAudioPlayback}
                        className="flex items-center gap-2"
                      >
                        {isAudioPlaying ? <Pause size={16} /> : <Play size={16} />}
                        {isAudioPlaying ? "Pause" : "Play"}
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {audioFile?.name}
                      </span>
                    </div>

                    {isTranscribingUpload && (
                      <div className="space-y-2">
                        <div className="text-sm text-center">
                          {uploadProgress < 100 ? "Uploading and transcribing..." : "Processing..."}
                        </div>
                        <Progress value={uploadProgress} className="h-2" />
                      </div>
                    )}

                    {transcriptionResult && !isTranscribingUpload && (
                      <div className="p-2 bg-green-50 rounded-md">
                        <p className="text-sm text-green-700">Transcription complete!</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <div className="flex justify-center gap-4">
                {!isRecording ? (
                  <Button onClick={startRecording} disabled={isTranscribingUpload || !!audioFile}>
                    <motion.div
                      animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
                      transition={{ repeat: Infinity, duration: 1, ease: "easeInOut" }}
                      className="mr-2"
                    >
                      <Mic className="h-4 w-4" />
                    </motion.div>
                    Start Recording
                  </Button>
                ) : isPaused ? (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={resumeRecording}>
                      <Play className="mr-2 h-4 w-4" />
                      Resume
                    </Button>
                    <Button variant="destructive" onClick={stopRecording}>
                      <StopCircle className="mr-2 h-4 w-4" />
                      Stop
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={pauseRecording}>
                      <Pause className="mr-2 h-4 w-4" />
                      Pause
                    </Button>
                    <Button onClick={stopRecording} variant="destructive">
                      <StopCircle className="mr-2 h-4 w-4" />
                      Stop
                    </Button>
                  </div>
                )}
              </div>
              <div className="relative w-full">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-center gap-2">
                <label htmlFor="audio-upload" className="cursor-pointer">
                  <input
                    id="audio-upload"
                    type="file"
                    accept="audio/*"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={isRecording}
                  />
                  <Button variant="outline" asChild disabled={isRecording}>
                    <div className="flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Upload Audio File
                    </div>
                  </Button>
                </label>
                {audioFile && (
                  <Button 
                    onClick={transcribeAudioFile} 
                    disabled={isTranscribingUpload || isRecording}
                    className="transition-transform duration-300 transform hover:scale-105"
                  >
                    {isTranscribingUpload ? "Transcribing..." : "Transcribe Audio"}
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>
        </motion.div>
        {hasContent && (
          <div className="mt-8 space-y-4">
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>
                    {format === "soap"
                      ? "SOAP Notes"
                      : format === "medical"
                        ? "Medical Notes"
                        : "Raw Text"}
                  </span>
                  <div className="text-sm font-normal bg-primary/10 px-3 py-1 rounded-full">
                    {formatTime(recordingTime)}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditMode && (
                  <div className="mb-4 space-y-4 p-4 border rounded-md bg-muted/20">
                    <h3 className="text-sm font-medium">Edit Recording Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-pet-select">Pet</Label>
                        <Select value={selectedPet} onValueChange={setSelectedPet}>
                          <SelectTrigger id="edit-pet-select" className="w-full">
                            <SelectValue placeholder="Select pet" />
                          </SelectTrigger>
                          <SelectContent>
                            {pets.map((pet) => (
                              <SelectItem key={pet.id} value={pet.id}>
                                {pet.name} ({pet.species})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-clinic-select">Clinic</Label>
                        <Select value={selectedClinic} onValueChange={setSelectedClinic}>
                          <SelectTrigger id="edit-clinic-select" className="w-full">
                            <SelectValue placeholder="Select clinic" />
                          </SelectTrigger>
                          <SelectContent>
                            {clinics.map((clinic) => (
                              <SelectItem key={clinic.id} value={clinic.id}>
                                {clinic.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-visit-type">Visit Type</Label>
                        <Select value={visitType} onValueChange={setVisitType}>
                          <SelectTrigger id="edit-visit-type">
                            <SelectValue placeholder="Select visit type" />
                          </SelectTrigger>
                          <SelectContent>
                            {visitTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
                <Textarea
                  value={editableText}
                  onChange={handleTextChange}
                  className="min-h-[200px] font-mono"
                  disabled={isRecording}
                />
              </CardContent>
              <CardFooter className="flex justify-between max-[550px]:flex-col max-[550px]:items-stretch max-[550px]:space-y-2">
                <AlertDialog open={isDiscardDialogOpen} onOpenChange={setIsDiscardDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="max-[550px]:w-full">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Discard
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Discard Transcription</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to discard this transcription? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={discardTranscription}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Discard
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <div className="flex space-x-2 max-[550px]:flex-col max-[550px]:space-x-0 max-[550px]:space-y-2 max-[550px]:w-full">
                  <Button
                    className="transition-transform duration-300 transform hover:scale-105 max-[550px]:w-full"
                    variant="outline"
                    onClick={() => setIsEditMode(!isEditMode)}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    {isEditMode ? "Done Editing" : "Edit"}
                  </Button>

                  <AlertDialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button className="transition-transform duration-300 transform hover:scale-105 max-[550px]:w-full">
                        <Save className="mr-2 h-4 w-4" />
                        Save
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Save Transcription</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to save this transcription?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={saveTranscription}>Save</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardFooter>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordingInterface;
