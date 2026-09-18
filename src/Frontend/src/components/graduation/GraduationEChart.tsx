import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import type { GraduationChartType } from '../../types/graduationAnalytics';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  LabelLayout,
  CanvasRenderer,
]);

interface GraduationEChartProps {
  type: GraduationChartType;
  data: Array<Record<string, string | number | null>>;
  series: Array<{
    key: string;
    label: string;
    chartType?: 'bar' | 'line';
    stack?: string;
    stackLabel?: string;
    stackLabelKey?: string;
    tooltipCountKey?: string;
    tooltipTotalKey?: string;
  }>;
  unit?: 'count' | 'percent';
  showLabels: boolean;
  showLegend?: boolean;
  tooltipTrigger?: 'axis' | 'item';
  colors?: string[];
  referenceLine?: { value: number; label: string };
  xAxisName?: string;
  yAxisName?: string;
}

const colors = ['#0788b8', '#e07a2d', '#5b8f3c', '#7557a5', '#c24f6d', '#526d82', '#38a3a5', '#d49b28'];

const formatValue = (value: unknown, unit?: 'count' | 'percent') => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${numeric.toLocaleString('vi-VN', { maximumFractionDigits: unit === 'percent' ? 1 : 0 })}${unit === 'percent' ? '%' : ''}`;
};

const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character] ?? character);

export function GraduationEChart({
  type,
  data,
  series,
  unit,
  showLabels,
  showLegend = true,
  tooltipTrigger = 'axis',
  colors: customColors,
  referenceLine,
  xAxisName,
  yAxisName,
}: GraduationEChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);
  const option = useMemo<EChartsOption>(() => {
    const palette = customColors?.length ? customColors : colors;
    const categories = data.map((row) => String(row.name ?? ''));
    const isHorizontal = type === 'bar' || type === 'stacked-bar';
    const isStacked = type === 'stacked-bar' || type === 'stacked-column';
    const isPie = type === 'pie' || type === 'donut';
    const isLineChart = type === 'line' || type === 'area';
    const isCombo = type === 'combo';
    const hasStackLabels = series.some((item) => Boolean(item.stackLabel || item.stackLabelKey));
    const visibleCategoryCount = isHorizontal ? 9 : 8;
    // Hai loại zoom giải quyết hai vấn đề khác nhau: nhiều nhóm thì cuộn theo trục
    // danh mục; nhiều chuỗi hoặc ít nhóm thì zoom trục giá trị để tách các đường/cột
    // đang nằm sát nhau. Với biểu đồ dọc, zoom giá trị chính là thanh dọc bên phải.
    const needsCategoryZoom = categories.length > visibleCategoryCount;
    const needsValueZoom = unit === 'percent'
      || series.length > 1
      || (categories.length > 1 && !needsCategoryZoom);
    const categoryZoomEnd = Math.min(100, (visibleCategoryCount / categories.length) * 100);
    const maximumPercentValue = Math.max(
      referenceLine?.value ?? 0,
      ...data.map((row) => isStacked
        ? series.reduce((sum, item) => sum + (typeof row[item.key] === 'number' ? Number(row[item.key]) : 0), 0)
        : Math.max(0, ...series.map((item) => typeof row[item.key] === 'number' ? Number(row[item.key]) : 0))),
    );
    const valueZoomEnd = unit === 'percent' && !isStacked
      ? Math.min(100, Math.max(10, Math.ceil(maximumPercentValue * 1.2 / 5) * 5))
      : 100;
    const valueAxis = {
      type: 'value' as const,
      min: 0,
      max: unit === 'percent' ? 100 : undefined,
      name: isHorizontal ? xAxisName : yAxisName,
      nameLocation: 'middle' as const,
      nameGap: isHorizontal ? 34 : 42,
      nameTextStyle: { color: '#000000', fontSize: 13 },
      axisLabel: { formatter: (value: number) => formatValue(value, unit) },
      splitLine: { lineStyle: { color: '#d9dfe3', type: 'dashed' as const } },
    };
    const categoryAxis = {
      type: 'category' as const,
      data: categories,
      name: isHorizontal ? yAxisName : xAxisName,
      nameLocation: 'middle' as const,
      nameGap: isHorizontal ? 118 : 34,
      nameTextStyle: { color: '#000000', fontSize: 13 },
      axisTick: { alignWithLabel: true },
      axisLabel: {
        color: '#000000',
        fontSize: 13,
        interval: 0,
        rotate: !isHorizontal && categories.length > 6 ? 28 : 0,
        width: isHorizontal ? 170 : 115,
        overflow: 'truncate' as const,
        hideOverlap: true,
        formatter: (value: string) => {
          const limit = isHorizontal ? 28 : 22;
          return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
        },
      },
    };

    const formatItemTooltip = (params?: CallbackDataParams) => {
      if (!params) return '';
      const item = typeof params.seriesIndex === 'number' ? series[params.seriesIndex] : undefined;
      const row = data[params.dataIndex];
      const count = item?.tooltipCountKey ? row?.[item.tooltipCountKey] : null;
      const total = item?.tooltipTotalKey ? row?.[item.tooltipTotalKey] : null;
      const details = [
        `<strong>${escapeHtml(params.name)}</strong>`,
        `${typeof params.marker === 'string' ? params.marker : ''}${escapeHtml(item?.label ?? params.seriesName ?? '')}: <strong>${escapeHtml(formatValue(params.value, unit))}</strong>`,
      ];
      if (unit === 'percent' && typeof count === 'number' && typeof total === 'number') {
        details.push(`Số lượng: ${escapeHtml(formatValue(count))}/${escapeHtml(formatValue(total))} sinh viên`);
      }
      return details.join('<br/>');
    };

    if (isPie) {
      const selected = series[0];
      return {
        color: palette,
        animationDuration: 350,
        aria: { enabled: true },
        tooltip: {
          trigger: 'item',
          valueFormatter: (value) => formatValue(value, unit),
        },
        legend: { type: 'scroll', orient: 'vertical', right: 8, top: 'middle', bottom: 8 },
        series: [{
          name: selected?.label ?? 'Giá trị',
          type: 'pie',
          radius: type === 'donut' ? ['46%', '70%'] : ['0%', '70%'],
          center: ['39%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: {
            show: showLabels,
            formatter: (params) => `${params.name}\n${formatValue(params.value, unit)}`,
          },
          data: data.map((row) => ({ name: String(row.name ?? ''), value: Number(row[selected?.key] ?? 0) })),
        }],
      };
    }

    const chartSeries = series.map((item, index) => {
      const seriesChartType = item.chartType ?? (isLineChart ? 'line' : 'bar');
      const seriesIsLine = seriesChartType === 'line';
      return {
        name: item.label,
        type: seriesChartType,
        data: data.map((row) => typeof row[item.key] === 'number' ? row[item.key] : null),
        stack: item.stack ?? (isStacked ? 'total' : undefined),
        smooth: seriesIsLine ? 0.35 : false,
        smoothMonotone: seriesIsLine ? 'x' as const : undefined,
        symbol: seriesIsLine ? 'circle' as const : undefined,
        symbolSize: seriesIsLine ? 9 : 7,
        showSymbol: data.length <= 30,
        areaStyle: type === 'area' && seriesIsLine ? { opacity: 0.14 } : undefined,
        itemStyle: {
          color: palette[index % palette.length],
          borderColor: seriesIsLine ? '#fff' : undefined,
          borderWidth: seriesIsLine ? 1.5 : undefined,
        },
        lineStyle: seriesIsLine ? { width: 3, cap: 'round' as const, join: 'round' as const } : undefined,
        barMaxWidth: 52,
        label: {
          show: Boolean(item.stackLabel || item.stackLabelKey) || showLabels,
          position: isHorizontal
            ? 'right' as const
            : isCombo && !seriesIsLine
              ? 'insideTop' as const
              : 'top' as const,
          formatter: item.stackLabelKey
            ? (params: CallbackDataParams) => String(data[params.dataIndex]?.[item.stackLabelKey!] ?? '')
            : item.stackLabel
              ? item.stackLabel
              : (params: { value?: unknown }) => formatValue(params.value, unit),
          color: isCombo && !seriesIsLine
            ? '#fff'
            : seriesIsLine && series.length > 1
              ? palette[index % palette.length]
              : '#4d5962',
          fontSize: 13,
          fontWeight: item.stackLabel || item.stackLabelKey || (isCombo && seriesIsLine) ? 650 : 400,
          lineHeight: item.stackLabelKey ? 15 : undefined,
        },
        labelLayout: item.stackLabel || item.stackLabelKey ? { hideOverlap: true } : undefined,
        emphasis: { focus: tooltipTrigger === 'item' ? 'self' as const : 'series' as const },
        tooltip: tooltipTrigger === 'axis' ? {
          trigger: 'item' as const,
          formatter: (params: CallbackDataParams) => formatItemTooltip(params),
        } : undefined,
        markLine: index === 0 && referenceLine ? {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#df3d35', type: 'dashed' as const, width: 1.5 },
          label: {
            show: true,
            formatter: referenceLine.label,
            position: 'insideEndTop' as const,
            color: '#fff',
            backgroundColor: '#df3d35',
            padding: [3, 5],
            fontSize: 13,
            fontWeight: 700,
          },
          data: [{ yAxis: referenceLine.value }],
        } : undefined,
      };
    });
    const categoryDataZoom = !needsCategoryZoom ? [] : isHorizontal ? [
      { type: 'inside' as const, yAxisIndex: 0, start: 0, end: categoryZoomEnd },
      {
        type: 'slider' as const, yAxisIndex: 0, start: 0, end: categoryZoomEnd,
        right: 5, top: 44, bottom: 24, width: 14, showDetail: false, brushSelect: false,
      },
    ] : [
      { type: 'inside' as const, xAxisIndex: 0, start: 0, end: categoryZoomEnd },
      {
        type: 'slider' as const, xAxisIndex: 0, start: 0, end: categoryZoomEnd,
        left: 52, right: needsValueZoom ? 48 : 24, bottom: 4, height: 18,
        showDetail: false, brushSelect: false,
      },
    ];
    const valueDataZoom = !needsValueZoom ? [] : isHorizontal ? [
      {
        type: 'inside' as const, xAxisIndex: 0, start: 0, end: valueZoomEnd,
        filterMode: 'none' as const,
      },
      {
        type: 'slider' as const, xAxisIndex: 0, start: 0, end: valueZoomEnd,
        filterMode: 'none' as const, left: 184, right: 24, bottom: 4, height: 18,
        showDetail: true, brushSelect: false,
      },
    ] : [
      {
        type: 'inside' as const, yAxisIndex: 0, start: 0, end: valueZoomEnd,
        filterMode: 'none' as const,
      },
      {
        type: 'slider' as const, yAxisIndex: 0, start: 0, end: valueZoomEnd,
        filterMode: 'none' as const, right: 4, top: 48, bottom: 48, width: 14,
        showDetail: true, brushSelect: false,
      },
    ];

    return {
      color: palette,
      animationDuration: 350,
      aria: { enabled: true },
      tooltip: tooltipTrigger === 'item'
        ? {
          trigger: 'item',
          formatter: (rawParams: CallbackDataParams | CallbackDataParams[]) => {
            const params = Array.isArray(rawParams) ? rawParams[0] : rawParams;
            return formatItemTooltip(params);
          },
        }
        : {
          trigger: 'axis',
          axisPointer: { type: isLineChart || isCombo ? 'line' : 'shadow' },
          valueFormatter: (value) => formatValue(value, unit),
        },
      legend: { show: showLegend && series.length > 1, type: 'scroll', top: 0 },
      dataZoom: [...categoryDataZoom, ...valueDataZoom],
      grid: {
        top: showLegend && series.length > 1 ? 46 : hasStackLabels ? 48 : 20,
        left: isHorizontal ? 184 : yAxisName ? 68 : 52,
        right: !isHorizontal && needsValueZoom
          ? showLabels ? 86 : 48
          : isHorizontal && needsCategoryZoom ? 34 : showLabels ? 70 : 24,
        bottom: !isHorizontal && needsCategoryZoom
          ? 108
          : !isHorizontal && categories.length > 6
            ? 94
            : xAxisName ? 66 : 54,
        containLabel: false,
      },
      xAxis: isHorizontal ? valueAxis : categoryAxis,
      yAxis: isHorizontal ? categoryAxis : valueAxis,
      series: chartSeries,
    };
  }, [customColors, data, referenceLine, series, showLabels, showLegend, tooltipTrigger, type, unit, xAxisName, yAxisName]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const chart = echarts.init(host, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(host);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || tooltipTrigger !== 'axis') return;

    const showOnlyHoveredItem = (params: CallbackDataParams) => {
      if (params.componentType !== 'series') return;
      chart.setOption({ tooltip: { trigger: 'item' } }, { lazyUpdate: true });
      chart.dispatchAction({
        type: 'showTip',
        seriesIndex: params.seriesIndex,
        dataIndex: params.dataIndex,
      });
    };
    const restoreGroupTooltip = () => {
      chart.setOption({ tooltip: { trigger: 'axis' } }, { lazyUpdate: true });
    };

    chart.on('mouseover', showOnlyHoveredItem);
    chart.on('mouseout', restoreGroupTooltip);
    chart.on('globalout', restoreGroupTooltip);
    return () => {
      chart.off('mouseover', showOnlyHoveredItem);
      chart.off('mouseout', restoreGroupTooltip);
      chart.off('globalout', restoreGroupTooltip);
    };
  }, [tooltipTrigger]);

  return <div ref={hostRef} className="graduation-echart" />;
}
