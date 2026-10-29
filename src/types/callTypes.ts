// types/callTypes.ts
export interface CallRecording {
  id: string;
  petName: string;
  ownerName: string;
  phoneNumber: string;
  date: string;
  duration: number; // seconds
  audioUrl?: string;
  transcription?: string;
  summary?: string;
  status: "pending" | "approved" | "rejected";
  approvedBy?: string;
  approvedDate?: string;
  callType: "whatsapp" | "regular"; // نیا field
  callDirection: "outgoing" | "incoming"; // نیا field
}