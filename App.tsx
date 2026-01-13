import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Printer, HistoryRecord } from './types';
import {
  Trash2,
  FileText,
  Plus,
  ArrowLeft,
  Upload,
  AlertTriangle,
  Network,
  Check,
  Download,
  History,
  Save,
  Calendar,
  Eye,
  FolderOpen,
  Edit
} from 'lucide-react';

// Detecta se está rodando dentro do Electron (Windows App)
const isElectron = navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;

const App: React.FC = () => {
  const [printers, setPrinters] = useState<Printer[]>(() => {
    try {
      const saved = localStorage.getItem('printers_v4');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [history, setHistory] = useState<HistoryRecord[]>(() => {
    try {
      const saved = localStorage.getItem('agl_history_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [config, setConfig] = useState({
    franquia: 52200,
    valorCopia: 0.05
  });

  const [modalMode, setModalMode] = useState<'add' | 'close_month' | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [viewingHistoryRecord, setViewingHistoryRecord] = useState<HistoryRecord | null>(null);
  const [printerToDelete, setPrinterToDelete] = useState<string | null>(null);
  const [printerToEdit, setPrinterToEdit] = useState<Printer | null>(null);
  const [pendingCloseData, setPendingCloseData] = useState<{ period: string, record: HistoryRecord } | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newPrinter, setNewPrinter] = useState<Partial<Printer>>({
    name: '',
    ip: '',
    model: '',
    lastMonthCounter: 0,
    currentCounter: 0
  });

  // Salva os dados localmente sempre que houver mudança
  useEffect(() => {
    const data = JSON.stringify(printers);
    localStorage.setItem('printers_v4', data);

    // Se for Electron, envia para o processo principal salvar no arquivo .json
    if (isElectron && (window as any).electronAPI) {
      (window as any).electronAPI.saveData('printers.json', data);
    }
  }, [printers]);

  useEffect(() => {
    const data = JSON.stringify(history);
    localStorage.setItem('agl_history_v1', data);

    if (isElectron && (window as any).electronAPI) {
      (window as any).electronAPI.saveData('history.json', data);
    }
  }, [history]);

  const AGLLogo = ({ size = "normal" }: { size?: "small" | "normal" }) => {
    const height = size === "small" ? 36 : 55;
    return (
      <div className="flex items-center justify-center select-none pointer-events-none">
        <img src="/agl-logo.png" alt="AGL Logo" style={{ height: `${height}px` }} />
      </div>
    );
  };

  // Fixed error: Added missing promptDelete function
  const promptDelete = (id: string) => {
    setPrinterToDelete(id);
  };

  const confirmDelete = () => {
    if (printerToDelete) {
      setPrinters(current => current.filter(p => p.id !== printerToDelete));
      setPrinterToDelete(null);
    }
  };

  const parseNumber = (val: any): number => {
    if (!val) return 0;
    const s = String(val).trim();
    const clean = s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
    const num = Math.floor(Number(clean));
    return isNaN(num) ? 0 : num;
  };

  const processCSV = (text: string) => {
    const allLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
    if (allLines.length < 2) return;
    const separator = allLines.some(l => l.includes(';')) ? ';' : ',';
    let headerIdx = -1;
    let colMap = { name: -1, model: -1, ip: -1, counter: -1 };

    for (let i = 0; i < allLines.length; i++) {
      const cols = allLines[i].split(separator).map(c => c.trim().toLowerCase());
      if (cols.some(c => c.includes('impressora') || c === 'ip' || c.includes('modelo'))) {
        headerIdx = i;
        colMap = {
          name: cols.findIndex(c => c.includes('impressora')),
          model: cols.findIndex(c => c.includes('modelo')),
          ip: cols.findIndex(c => c === 'ip'),
          counter: cols.findIndex(c => c.includes('medi[cç][aã]o') || c.includes('atual'))
        };
        if (colMap.counter === -1) colMap.counter = 3;
        break;
      }
    }

    if (headerIdx === -1) return alert("Erro no cabeçalho do CSV");

    setPrinters(prev => {
      const updated = [...prev];
      for (let i = headerIdx + 1; i < allLines.length; i++) {
        const row = allLines[i].split(separator).map(c => c.trim());
        const name = row[colMap.name] || '';
        const ip = row[colMap.ip] || '';
        if (!name || !ip) continue;
        const val = parseNumber(row[colMap.counter]);
        const idx = updated.findIndex(p => p.ip === ip);
        if (idx !== -1) {
          updated[idx] = { ...updated[idx], lastMonthCounter: val, currentCounter: 0 };
        } else {
          updated.push({ id: crypto.randomUUID(), name, ip, model: row[colMap.model] || 'N/A', lastMonthCounter: val, currentCounter: 0, status: 'unknown' });
        }
      }
      return updated;
    });
  };

  const totals = useMemo(() => {
    const totalCopias = printers.reduce((acc, p) => acc + Math.max(0, (p.currentCounter || 0) - p.lastMonthCounter), 0);
    const excedente = Math.max(0, totalCopias - config.franquia);
    const valorFranquia = config.franquia * config.valorCopia;
    const valorExcedente = excedente * config.valorCopia;
    const totalPagar = valorFranquia + valorExcedente;
    return { totalCopias, excedente, totalPagar, valorFranquia, valorExcedente };
  }, [printers, config]);

  const closeMonth = () => {
    const period = new Date().toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
    const newRecord: HistoryRecord = {
      id: crypto.randomUUID(),
      period,
      timestamp: new Date().toISOString(),
      printers: [...printers],
      config: { ...config },
      totals: { ...totals }
    };

    // Check if a record already exists for this period
    const existingRecord = history.find(h => h.period === period);

    if (existingRecord) {
      // Store pending data and show confirmation
      setPendingCloseData({ period, record: newRecord });
      setModalMode(null);
    } else {
      // No existing record, proceed normally
      setHistory(prev => [newRecord, ...prev]);
      setPrinters(prev => prev.map(p => ({
        ...p,
        lastMonthCounter: p.currentCounter || p.lastMonthCounter,
        currentCounter: 0
      })));
      setModalMode(null);
      alert(`Mês ${period} fechado! Arquivo de histórico atualizado na pasta.`);
    }
  };

  const confirmOverwrite = () => {
    if (!pendingCloseData) return;

    const { period, record } = pendingCloseData;

    // Remove existing record and add new one
    setHistory(prev => [record, ...prev.filter(h => h.period !== period)]);
    setPrinters(prev => prev.map(p => ({
      ...p,
      lastMonthCounter: p.currentCounter || p.lastMonthCounter,
      currentCounter: 0
    })));
    setPendingCloseData(null);
    alert(`Mês ${period} fechado! Registro anterior foi sobrescrito.`);
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPdf(true);
    const element = document.getElementById('printable-content');
    if (!element || !(window as any).html2pdf) {
      setIsGeneratingPdf(false);
      return;
    }

    const opt = {
      margin: 0,
      filename: `fechamento_agl_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FFFFFF'
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
      await (window as any).html2pdf().set(opt).from(element).save();
    } catch (e) {
      alert("Erro ao gerar PDF local.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const renderReport = (dataPrinters: Printer[], dataTotals: any, dataConfig: any, dataPeriod: string) => (
    <div id="report-view" className="min-h-screen bg-slate-800 py-10 flex flex-col items-center overflow-y-auto">
      <style>{`
        @page { size: A4; margin: 0; }
        .a4-page { width: 210mm; height: 297mm; padding: 8mm 12mm; margin: 0 auto; background: white; box-shadow: 0 20px 50px rgba(0,0,0,0.3); box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }
        .a4-page > * { margin: 0; }
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
          #report-view { background: white !important; padding: 0 !important; }
          .print-hide { display: none !important; }
          .a4-page { box-shadow: none !important; margin: 0 !important; padding: 8mm 12mm; height: 297mm; overflow: hidden; page-break-after: avoid; page-break-inside: avoid; }
          body { margin: 0; padding: 0; }
        }
      `}</style>
      <div className="w-[210mm] mb-6 flex justify-between items-center text-white/70 px-4 print-hide">
        <button onClick={() => { setShowReport(false); setViewingHistoryRecord(null); }} className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest hover:text-white transition-colors">
          <ArrowLeft size={16} /> Voltar
        </button>
        <div className="flex gap-4">
          <button onClick={() => window.print()} className="bg-slate-700 hover:bg-slate-600 px-6 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all">Imprimir</button>
          <button onClick={handleDownloadPDF} disabled={isGeneratingPdf} className="bg-blue-600 hover:bg-blue-700 px-6 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg">
            {isGeneratingPdf ? 'Gerando...' : <><Download size={14} /> Salvar PDF</>}
          </button>
        </div>
      </div>
      <div id="printable-content" className="a4-page">
        <header className="flex justify-between items-center border-b-[3px] border-slate-900 pb-3 mb-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">Relatório de <span className="text-[#F9C333]">Medição</span></h1>
            <p className="text-slate-400 font-bold uppercase text-[8px] tracking-[0.3em] ml-0.5">Competência: {dataPeriod}</p>
          </div>
          <AGLLogo size="small" />
        </header>
        <div className="flex-grow">
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="py-2 px-3 text-left font-black uppercase text-[9px]">Equipamento</th>
                <th className="py-2 px-3 text-center font-black uppercase text-[9px]">IP Rede</th>
                <th className="py-2 px-3 text-center font-black uppercase text-[9px]">Anterior</th>
                <th className="py-2 px-3 text-center font-black uppercase text-[9px]">Atual</th>
                <th className="py-2 px-3 text-right font-black uppercase text-[9px]">Produção</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 border-x border-slate-50">
              {dataPrinters.map(p => (
                <tr key={p.id}>
                  <td className="py-1 px-3">
                    <p className="font-black text-slate-800 uppercase text-[10px]">{p.name}</p>
                    <p className="text-[8px] text-slate-400 font-bold">{p.model}</p>
                  </td>
                  <td className="py-1 px-3 text-center font-mono text-[9px]">{p.ip}</td>
                  <td className="py-1 px-3 text-center text-slate-400 text-[10px]">{p.lastMonthCounter.toLocaleString()}</td>
                  <td className="py-1 px-3 text-center text-slate-900 font-bold text-[10px]">{p.currentCounter.toLocaleString()}</td>
                  <td className="py-1 px-3 text-right font-black text-blue-600 text-[10px]">{(p.currentCounter - p.lastMonthCounter).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-slate-50 border rounded-xl p-4">
              <h3 className="text-[8px] font-black uppercase text-slate-400 mb-2 border-b pb-1">Apuração</h3>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold"><span>Franquia</span><span>{dataConfig.franquia.toLocaleString()}</span></div>
                <div className="flex justify-between text-[10px] font-bold"><span>Medido</span><span>{dataTotals.totalCopias.toLocaleString()}</span></div>
                <div className="flex justify-between text-[10px] border-t pt-1 mt-1"><span className="font-black uppercase text-[8px]">Excedente</span><span className="font-black text-red-600">{dataTotals.excedente.toLocaleString()}</span></div>
              </div>
            </div>
            <div className="bg-blue-600 rounded-xl p-4 text-white">
              <p className="text-[8px] font-black uppercase opacity-80 mb-2">Total a Faturar</p>
              <div className="space-y-1 mb-2">
                <div className="flex justify-between text-[10px] font-bold">
                  <span>Valor Mínimo</span>
                  <span>R$ {dataTotals.valorFranquia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-[10px] font-bold">
                  <span>Valor Excedente</span>
                  <span>R$ {dataTotals.valorExcedente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <div className="flex justify-between items-center border-t border-white/20 pt-2">
                <span className="text-[10px] font-black uppercase">Total</span>
                <div className="text-2xl font-black">R$ {dataTotals.totalPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>
          </div>
          <footer className="grid grid-cols-2 gap-10 items-end pt-4">
            <p className="text-[7px] text-slate-400 uppercase font-bold">Gerado em: {new Date().toLocaleString('pt-BR')}</p>
            <div className="text-center border-t border-slate-900 pt-1 font-black uppercase text-[8px]">Assinatura Gestor</div>
          </footer>
        </div>
      </div>
    </div>
  );

  if (showReport) return renderReport(printers, totals, config, new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  if (viewingHistoryRecord) return renderReport(viewingHistoryRecord.printers, viewingHistoryRecord.totals, viewingHistoryRecord.config, viewingHistoryRecord.period);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-20 font-sans">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <AGLLogo size="small" />
          <div className="hidden sm:block border-l pl-6">
            <h1 className="text-lg font-extrabold text-slate-900">Gestão TI <span className="text-blue-600">AGL</span></h1>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Contador Mensal de Impressões</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isElectron && (
            <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors" title="Abrir pasta de arquivos">
              <FolderOpen size={20} />
            </button>
          )}
          <button onClick={() => setActiveTab('current')} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase ${activeTab === 'current' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}>Medição</button>
          <button onClick={() => setActiveTab('history')} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase flex items-center gap-2 ${activeTab === 'history' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}><History size={14} /> Histórico</button>
          <div className="w-px h-8 bg-slate-100 mx-2"></div>
          <input type="file" ref={fileInputRef} onChange={e => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = ev => processCSV(ev.target?.result as string);
              reader.readAsText(file, 'ISO-8859-1');
            }
          }} accept=".csv" className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-5 py-2.5 rounded-xl text-xs font-bold uppercase flex items-center gap-2 hover:bg-emerald-100 transition-all"><Upload size={14} /> Importar CSV</button>
          <button onClick={() => setModalMode('add')} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all"><Plus size={14} strokeWidth={3} /> Nova</button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {activeTab === 'current' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm text-center flex flex-col justify-center">
                <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Franquia</p>
                <input type="number" className="text-2xl font-black w-full outline-none text-slate-900 bg-transparent text-center" value={config.franquia} onChange={e => setConfig({ ...config, franquia: Number(e.target.value) })} />
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm text-center flex flex-col justify-center">
                <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Valor da Cópia (R$)</p>
                <input type="number" step="0.01" className="text-2xl font-black w-full outline-none text-slate-900 bg-transparent text-center" value={config.valorCopia} onChange={e => setConfig({ ...config, valorCopia: Number(e.target.value) })} />
              </div>
              <div className="bg-blue-600 p-6 rounded-3xl shadow-xl text-white text-center flex flex-col justify-center">
                <p className="text-[11px] font-bold text-blue-100 uppercase mb-1">Volume Total</p>
                <div className="text-3xl font-black">{totals.totalCopias.toLocaleString()}</div>
              </div>
              <div className="bg-slate-900 p-6 rounded-3xl shadow-xl text-white text-center flex flex-col justify-center">
                <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Total à Pagar</p>
                <div className="text-3xl font-black text-emerald-400">R$ {totals.totalPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>

            <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="px-8 py-6">Equipamento</th>
                    <th className="px-8 py-6">Rede (IP)</th>
                    <th className="px-8 py-6 text-center">Anterior</th>
                    <th className="px-8 py-6 text-center">Atual</th>
                    <th className="px-8 py-6 text-right">Produção</th>
                    <th className="px-8 py-6 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {printers.map((p) => (
                    <tr key={p.id} className="hover:bg-blue-50/20 transition-colors">
                      <td className="px-8 py-5">
                        <div className="font-bold text-slate-800 text-sm">{p.name}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">{p.model}</div>
                      </td>
                      <td className="px-8 py-5 font-mono text-xs text-slate-500 font-semibold">{p.ip}</td>
                      <td className="px-8 py-5 text-center">
                        <input type="number" className="w-28 text-center bg-slate-50 border border-slate-200 rounded-lg py-1.5 text-xs font-bold" value={p.lastMonthCounter} onChange={e => setPrinters(curr => curr.map(item => item.id === p.id ? { ...item, lastMonthCounter: parseNumber(e.target.value) } : item))} />
                      </td>
                      <td className="px-8 py-5 text-center">
                        <input type="number" placeholder="0" className="w-28 text-center bg-white border-2 border-blue-100 rounded-lg py-1.5 text-xs font-black text-blue-700 focus:border-blue-500 outline-none" value={p.currentCounter || ''} onChange={e => setPrinters(curr => curr.map(item => item.id === p.id ? { ...item, currentCounter: parseNumber(e.target.value) } : item))} />
                      </td>
                      <td className="px-8 py-5 text-right font-black text-slate-900">
                        {Math.max(0, (p.currentCounter || 0) - p.lastMonthCounter).toLocaleString()}
                      </td>
                      <td className="px-8 py-5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => setPrinterToEdit(p)} className="p-2 hover:bg-blue-50 text-slate-300 hover:text-blue-500 rounded-lg transition-colors"><Edit size={16} /></button>
                          <button onClick={() => promptDelete(p.id)} className="p-2 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-lg transition-colors"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {printers.length > 0 && (
              <div className="mt-10 flex justify-end gap-4">
                <button onClick={() => setShowReport(true)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-900 px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center gap-3 shadow-sm transition-all">
                  <FileText size={18} /> Visualizar Relatório
                </button>
                <button onClick={() => setModalMode('close_month')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center gap-3 shadow-xl shadow-emerald-500/20 transition-all hover:-translate-y-1">
                  <Save size={18} /> Fechar Mês e Salvar Local
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-6">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Histórico Salvo em Arquivo</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {history.length === 0 ? (
                <div className="col-span-full py-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-slate-300">
                  <Calendar size={48} className="mb-4 opacity-20" />
                  <p className="font-black uppercase tracking-widest text-sm">Nenhum fechamento registrado</p>
                </div>
              ) : history.map(record => (
                <div key={record.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-xl transition-all group">
                  <div className="flex justify-between items-start mb-6">
                    <div className="bg-blue-50 text-blue-600 p-3 rounded-2xl"><Calendar size={24} /></div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Período</p>
                      <p className="text-xl font-black text-slate-900">{record.period}</p>
                    </div>
                  </div>
                  <div className="space-y-3 mb-8">
                    <div className="flex justify-between text-xs font-bold"><span className="text-slate-400 uppercase">Equipamentos</span><span className="text-slate-900">{record.printers.length}</span></div>
                    <div className="flex justify-between text-xs font-bold"><span className="text-slate-400 uppercase">Total Páginas</span><span className="text-slate-900">{record.totals.totalCopias.toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm pt-3 border-t border-slate-50"><span className="text-slate-900 font-black uppercase text-[10px]">Faturamento</span><span className="text-emerald-500 font-black tabular-nums">R$ {record.totals.totalPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                  </div>
                  <button onClick={() => setViewingHistoryRecord(record)} className="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-2 group-hover:bg-blue-600 transition-colors">
                    <Eye size={14} /> Reabrir Relatório
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modais omitidos para brevidade, mantidos os mesmos do estado anterior */}
      {modalMode === 'add' && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-10 w-full max-w-sm shadow-2xl">
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase mb-8">Novo Equipamento</h2>
            <div className="space-y-5">
              <input placeholder="Nome" className="w-full bg-slate-50 p-4 rounded-xl font-bold outline-none border-2 border-transparent focus:border-blue-500" value={newPrinter.name} onChange={e => setNewPrinter({ ...newPrinter, name: e.target.value })} />
              <input placeholder="IP" className="w-full bg-slate-50 p-4 rounded-xl font-mono font-bold outline-none border-2 border-transparent focus:border-blue-500" value={newPrinter.ip} onChange={e => setNewPrinter({ ...newPrinter, ip: e.target.value })} />
              <button onClick={() => {
                if (newPrinter.name && newPrinter.ip) {
                  setPrinters(p => [...p, { ...newPrinter, id: crypto.randomUUID(), model: 'Scanner/Printer' } as Printer]);
                  setNewPrinter({ name: '', ip: '', model: '', lastMonthCounter: 0, currentCounter: 0 });
                  setModalMode(null);
                }
              }} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-blue-500/20 transition-all active:scale-95">Confirmar</button>
              <button onClick={() => setModalMode(null)} className="w-full text-slate-400 font-bold uppercase text-[10px] tracking-widest">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {modalMode === 'close_month' && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-10 w-full max-w-md shadow-2xl text-center">
            <div className="bg-blue-50 text-blue-600 p-5 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6"><Save size={40} /></div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-4">Fechar Mês e Salvar?</h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed font-medium italic">
              Esta ação criará um arquivo de backup na sua pasta local e resetará os contadores para o próximo mês.
            </p>
            <div className="flex gap-4">
              <button onClick={() => setModalMode(null)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-black uppercase text-xs tracking-widest transition-colors hover:bg-slate-200">Ainda não</button>
              <button onClick={closeMonth} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-emerald-500/20 transition-all hover:bg-emerald-700 active:scale-95">Confirmar Fechamento</button>
            </div>
          </div>
        </div>
      )}

      {printerToEdit && (
        <div className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-10 w-full max-w-sm shadow-2xl">
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase mb-8">Editar Equipamento</h2>
            <div className="space-y-5">
              <input
                placeholder="Nome"
                className="w-full bg-slate-50 p-4 rounded-xl font-bold outline-none border-2 border-transparent focus:border-blue-500"
                value={printerToEdit.name}
                onChange={e => setPrinterToEdit({ ...printerToEdit, name: e.target.value })}
              />
              <input
                placeholder="IP"
                className="w-full bg-slate-50 p-4 rounded-xl font-mono font-bold outline-none border-2 border-transparent focus:border-blue-500"
                value={printerToEdit.ip}
                onChange={e => setPrinterToEdit({ ...printerToEdit, ip: e.target.value })}
              />
              <input
                placeholder="Modelo"
                className="w-full bg-slate-50 p-4 rounded-xl font-bold outline-none border-2 border-transparent focus:border-blue-500"
                value={printerToEdit.model}
                onChange={e => setPrinterToEdit({ ...printerToEdit, model: e.target.value })}
              />
              <button
                onClick={() => {
                  if (printerToEdit.name && printerToEdit.ip) {
                    setPrinters(curr => curr.map(p => p.id === printerToEdit.id ? printerToEdit : p));
                    setPrinterToEdit(null);
                  }
                }}
                className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-blue-500/20 transition-all active:scale-95"
              >
                Salvar Alterações
              </button>
              <button
                onClick={() => setPrinterToEdit(null)}
                className="w-full text-slate-400 font-bold uppercase text-[10px] tracking-widest"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {printerToDelete && (
        <div className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl text-center">
            <div className="bg-red-50 text-red-500 p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4"><AlertTriangle size={32} /></div>
            <h3 className="text-lg font-black text-slate-900 mb-2">Remover impressora?</h3>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setPrinterToDelete(null)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-xs uppercase tracking-widest">Não</button>
              <button onClick={confirmDelete} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all">Remover</button>
            </div>
          </div>
        </div>
      )}

      {pendingCloseData && (
        <div className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl text-center">
            <div className="bg-amber-50 text-amber-500 p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4"><AlertTriangle size={32} /></div>
            <h3 className="text-lg font-black text-slate-900 mb-2">Sobrescrever fechamento?</h3>
            <p className="text-slate-600 text-sm mb-4">Já existe um fechamento para <strong>{pendingCloseData.period}</strong>. Deseja sobrescrever?</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setPendingCloseData(null)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-xs uppercase tracking-widest">Cancelar</button>
              <button onClick={confirmOverwrite} className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all">Sobrescrever</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;