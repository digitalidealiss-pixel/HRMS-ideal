import JSZip from 'jszip';
import {Check, Copy, Download, FileCode2} from 'lucide-react';
import {useEffect, useState} from 'react';
import {getStoredToken} from '../../services/apiClient';

interface DeploymentKitViewProps {
  onToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

export function DeploymentKitView({onToast}: DeploymentKitViewProps) {
  const [files, setFiles] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadKit = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/deployment-kit', {
          headers: {Authorization: `Bearer ${getStoredToken()}`},
        });
        const data = await res.json();
        if (data.ok && data.files) {
          setFiles(data.files);
          const keys = Object.keys(data.files).sort();
          if (keys.length > 0) setSelectedFile(keys[0]);
        }
      } catch (err: any) {
        onToast('error', 'Unable to load deployment bundle', err.message);
      } finally {
        setLoading(false);
      }
    };
    loadKit();
  }, []);

  const fileList = Object.keys(files).sort();

  const handleCopy = async () => {
    if (!selectedFile) return;
    await navigator.clipboard.writeText(files[selectedFile] || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    onToast('success', 'Copied to clipboard', selectedFile);
  };

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    for (const [path, content] of Object.entries(files)) {
      zip.file(path, content);
    }
    const blob = await zip.generateAsync({type: 'blob'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'IDEAL_HRMS_Hostinger_GAS_Deployment_Kit.zip';
    a.click();
    URL.revokeObjectURL(url);
    onToast('success', 'Deployment ZIP downloaded');
  };

  return (
    <div className="space-y-5">
      <div className="metallic-navy-panel overflow-hidden rounded-2xl text-white">
        <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-emerald-400 to-cyan-400" />
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-white">
              Google Apps Script &amp; Hostinger Deployment Kit
            </h1>
            <p className="mt-0.5 text-xs text-sky-100/85">
              Complete 23-sheet Apps Script backend, Hostinger public_html static bundle, and operational manuals
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={fileList.length === 0}
            className="metallic-btn-gold inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Download Full Bundle (.zip)
          </button>
        </div>
      </div>

      {loading ? (
        <div className="metallic-surface rounded-xl p-8 text-center text-xs text-slate-500">
          Loading deployment kit files...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="metallic-surface rounded-xl p-4 lg:col-span-4">
            <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-wide text-slate-500">
              Deliverable Files ({fileList.length})
            </h2>
            <div className="max-h-[540px] space-y-1 overflow-y-auto">
              {fileList.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSelectedFile(f)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-mono text-xs transition-colors ${
                    selectedFile === f ? 'bg-[#0B1B36] text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <FileCode2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{f}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-950 text-slate-100 lg:col-span-8">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <span className="font-mono text-xs text-slate-300">{selectedFile}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy Code'}
              </button>
            </div>
            <pre className="max-h-[540px] flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-slate-200">
              {files[selectedFile] || ''}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
