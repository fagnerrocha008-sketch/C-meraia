
export interface DetectionEvent {
  id: string;
  timestamp: Date;
  imageDataUrl: string;
  analysis: string | null;
  isAnalyzing: boolean;
}
