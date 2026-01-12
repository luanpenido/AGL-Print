
export interface Printer {
  id: string;
  name: string;
  ip: string;
  model: string;
  lastMonthCounter: number;
  currentCounter: number;
  status: 'online' | 'offline' | 'unknown';
}

export interface HistoryRecord {
  id: string;
  period: string; // MM/YYYY
  timestamp: string;
  printers: Printer[];
  config: {
    franquia: number;
    valorFranquia: number;
    valorExtra: number;
  };
  totals: {
    totalCopias: number;
    excedente: number;
    totalPagar: number;
  };
}

export interface PrintReport {
  printerId: string;
  printerName: string;
  previousCount: number;
  currentCount: number;
  totalPrinted: number;
  timestamp: string;
}

export interface AnalysisResult {
  summary: string;
  recommendations: string[];
  totalVolume: number;
}
