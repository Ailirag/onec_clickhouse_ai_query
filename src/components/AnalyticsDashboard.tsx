import React, { useMemo } from "react";
import { QueryResult, QueryAnalysis } from "../types";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import { FileText, TrendingUp, BarChart2, CheckCircle2, Lightbulb } from "lucide-react";

interface AnalyticsDashboardProps {
  result: QueryResult | null;
  analysis: QueryAnalysis | null;
  loading: boolean;
}

const PALETTE = [
  "#4f46e5", // Indigo
  "#10b981", // Emerald
  "#3b82f6", // Blue
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#ec4899", // Pink
  "#8b5cf6", // Purple
  "#06b6d4"  // Cyan
];

export default function AnalyticsDashboard({
  result,
  analysis,
  loading
}: AnalyticsDashboardProps) {
  if (loading) {
    return (
      <div id="analytics-loading" className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
        <span className="text-xs font-semibold text-slate-500">Генерируем интеллектуальный аналитический отчет...</span>
      </div>
    );
  }

  if (!result || !result.success || !analysis) return null;

  const chartData = useMemo(() => {
    if (!result.rows || result.rows.length === 0 || !analysis.suggestedChart) return [];
    
    // Sort or transform data if necessary. Make sure numbers are indeed numbers
    const yKey = analysis.suggestedChart.yAxis;
    return result.rows.map((row) => {
      const copy = { ...row };
      if (yKey && copy[yKey] !== undefined) {
        copy[yKey] = Number(copy[yKey]);
      }
      return copy;
    });
  }, [result, analysis]);

  const hasChart = analysis.suggestedChart && analysis.suggestedChart.type !== "none" && chartData.length > 0;

  const truncateLabel = (value: any) => {
    const str = String(value);
    if (str.length > 15) {
      return str.substring(0, 15) + "...";
    }
    return str;
  };

  const renderChart = () => {
    if (!hasChart || !analysis.suggestedChart) return null;

    const { type, xAxis, yAxis, title } = analysis.suggestedChart;

    const tooltipFormatter = (value: any) => [`${value}`, title || yAxis];

    switch (type) {
      case "bar":
        return (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey={xAxis}
                tickFormatter={truncateLabel}
                tick={{ fill: "#64748b", fontSize: 11 }}
                stroke="#cbd5e1"
              />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} stroke="#cbd5e1" />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: "8px", color: "#fff", fontSize: "11px" }}
                itemStyle={{ color: "#38bdf8" }}
              />
              <Bar dataKey={yAxis} fill="#6366f1" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case "line":
        return (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey={xAxis}
                tickFormatter={truncateLabel}
                tick={{ fill: "#64748b", fontSize: 11 }}
                stroke="#cbd5e1"
              />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} stroke="#cbd5e1" />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: "8px", color: "#fff", fontSize: "11px" }}
                itemStyle={{ color: "#38bdf8" }}
              />
              <Line type="monotone" dataKey={yAxis} stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        );

      case "area":
        return (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
              <defs>
                <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey={xAxis}
                tickFormatter={truncateLabel}
                tick={{ fill: "#64748b", fontSize: 11 }}
                stroke="#cbd5e1"
              />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} stroke="#cbd5e1" />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: "8px", color: "#fff", fontSize: "11px" }}
                itemStyle={{ color: "#38bdf8" }}
              />
              <Area type="monotone" dataKey={yAxis} stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#colorArea)" />
            </AreaChart>
          </ResponsiveContainer>
        );

      case "pie":
        return (
          <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-4">
            <ResponsiveContainer width={240} height={240}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey={yAxis}
                  nameKey={xAxis}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: "8px", color: "#fff", fontSize: "11px" }}
                  itemStyle={{ color: "#38bdf8" }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Inline Legend */}
            <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-4 text-xs">
              {chartData.map((row, index) => (
                <div key={index} className="flex items-center gap-2.5 font-medium text-slate-700">
                  <span
                    className="w-3 h-3 rounded-md shrink-0"
                    style={{ backgroundColor: PALETTE[index % PALETTE.length] }}
                  ></span>
                  <span className="truncate max-w-[150px]">{String(row[xAxis])}:</span>
                  <strong className="text-slate-900">{row[yAxis]}</strong>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div id="analytics-dashboard" className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
      {/* Visual representation */}
      {hasChart && (
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 size={18} className="text-indigo-600" />
              <h3 className="font-semibold text-sm text-slate-800 tracking-tight">
                {analysis.suggestedChart?.title || "Визуальный анализ"}
              </h3>
            </div>
            <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full font-semibold border border-indigo-100">
              График Recharts ({analysis.suggestedChart?.type})
            </span>
          </div>

          <div className="py-2" id="recharts-container">
            {renderChart()}
          </div>
        </div>
      )}

      {/* AI summary & insights */}
      <div className={`${hasChart ? "lg:col-span-5" : "lg:col-span-12"} bg-white rounded-xl border border-slate-200 p-6 shadow-sm`}>
        <div className="flex items-center gap-2 mb-4">
          <FileText size={18} className="text-violet-600" />
          <h3 className="font-semibold text-sm text-slate-800 tracking-tight">AI-Аналитика результатов</h3>
        </div>

        <div className="space-y-5">
          {/* Summary */}
          {analysis.summary && (
            <div className="bg-violet-50/40 rounded-xl p-4 border border-violet-100/50">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-800 mb-2 uppercase tracking-wide">
                <CheckCircle2 size={13} />
                Краткий вывод
              </span>
              <p className="text-xs text-slate-700 leading-relaxed font-sans">{analysis.summary}</p>
            </div>
          )}

          {/* Insights List */}
          {analysis.insights && analysis.insights.length > 0 && (
            <div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">
                <Lightbulb size={13} className="text-amber-500" />
                Ключевые инсайты
              </span>
              <ul className="space-y-3" id="insights-list">
                {analysis.insights.map((insight, idx) => (
                  <li key={idx} className="flex gap-2.5 items-start text-xs text-slate-600 leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-600 mt-1.5 shrink-0"></span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
