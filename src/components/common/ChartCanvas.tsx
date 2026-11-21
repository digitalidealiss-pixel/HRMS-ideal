import {useEffect, useRef} from 'react';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  type ChartConfiguration,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  RadarController,
  RadialLinearScale,
  Tooltip,
} from 'chart.js';

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  RadarController,
  RadialLinearScale,
  Tooltip,
);

interface ChartCanvasProps {
  config: ChartConfiguration;
  height?: number;
  emptyText?: string;
  isEmpty?: boolean;
}

export function ChartCanvas({config, height = 240, emptyText = 'No records available yet for this chart.', isEmpty}: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (isEmpty || !canvasRef.current) return;
    if (chartRef.current) {
      chartRef.current.destroy();
    }
    chartRef.current = new Chart(canvasRef.current, {
      ...config,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              font: {family: 'Public Sans, sans-serif', size: 11},
              color: '#475569',
            },
          },
          tooltip: {
            backgroundColor: '#0B1B36',
            titleFont: {family: 'Plus Jakarta Sans, sans-serif', size: 12},
            bodyFont: {family: 'JetBrains Mono, monospace', size: 11},
            padding: 10,
            cornerRadius: 6,
          },
          ...(config.options?.plugins || {}),
        },
        ...(config.options || {}),
      },
    });
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [config, isEmpty]);

  if (isEmpty) {
    return (
      <div
        style={{height}}
        className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center"
      >
        <p className="text-xs font-medium text-slate-500">{emptyText}</p>
      </div>
    );
  }

  return (
    <div style={{height}} className="relative w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}
