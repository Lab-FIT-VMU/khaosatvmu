import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import type { CallbackDataParams, EChartsOption } from 'echarts/types/dist/shared';
import type { GraduationYearOverviewPoint } from '../../types/graduationAnalytics';

echarts.use([
  LineChart,
  BarChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  LabelLayout,
  CanvasRenderer,
]);

const outcomeSeries = [
  { key: 'excellentCount', label: 'Xuất sắc', color: '#137b3b', labelPosition: 'top' },
  { key: 'veryGoodCount', label: 'Giỏi', color: '#6f9f45', labelPosition: 'top' },
  { key: 'goodCount', label: 'Khá', color: '#0788b8', labelPosition: 'top' },
  { key: 'averageCount', label: 'Trung bình', color: '#b86216', labelPosition: 'top' },
  { key: 'workStudyTransferCount', label: 'Chuyển VHVL', color: '#76558f', labelPosition: 'top' },
] as const;

const totalSeries = { label: 'Tổng sinh viên', color: '#275dad' } as const;

const formatNumber = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 0 });
const formatPercent = (value: number) => `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character] ?? character);

interface GraduationOutcomeTrendChartProps {
  data: GraduationYearOverviewPoint[];
}

const useCompactChart = () => {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 560px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 560px)');
    const handleChange = (event: MediaQueryListEvent) => setCompact(event.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);
  return compact;
};

export function GraduationOutcomeTrendChart({ data }: GraduationOutcomeTrendChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const compact = useCompactChart();
  const option = useMemo<EChartsOption>(() => {
    const maximumRate = Math.max(0, ...data.flatMap((point) => outcomeSeries.map((item) =>
      point.complete && point.totalOutcome > 0 ? point[item.key] / point.totalOutcome * 100 : 0)));
    const axisMaximum = Math.min(100, Math.max(10, Math.ceil(maximumRate * 1.2 / 10) * 10));

    return {
      animationDuration: 180,
      aria: { enabled: true },
      color: [...outcomeSeries.map((item) => item.color), totalSeries.color],
      tooltip: {
        trigger: 'item',
        formatter: (rawParams: CallbackDataParams | CallbackDataParams[]) => {
          const params = Array.isArray(rawParams) ? rawParams[0] : rawParams;
          if (!params || typeof params.seriesIndex !== 'number') return '';
          const point = data[params.dataIndex];
          const item = outcomeSeries[params.seriesIndex];
          if (!point || !item) return '';
          const count = point[item.key];
          const rate = point.totalOutcome > 0 ? count / point.totalOutcome * 100 : 0;
          return [
            `<strong>Năm ${escapeHtml(point.reviewYear)}</strong>`,
            `${typeof params.marker === 'string' ? params.marker : ''}${escapeHtml(item.label)}: <strong>${escapeHtml(formatPercent(rate))}</strong>`,
            `Số lượng: ${escapeHtml(formatNumber(count))}/${escapeHtml(formatNumber(point.totalOutcome))} sinh viên`,
          ].join('<br/>');
        },
      },
      legend: {
        orient: 'vertical',
        right: 8,
        top: 'middle',
        itemWidth: 18,
        itemHeight: 3,
        textStyle: { color: '#000000', fontSize: 13 },
      },
      grid: { top: 34, right: 138, bottom: 46, left: 58 },
      xAxis: {
        type: 'category',
        data: data.map((point) => String(point.reviewYear)),
        name: 'Năm xét',
        nameLocation: 'middle',
        nameGap: 30,
        boundaryGap: true,
        axisTick: { alignWithLabel: true },
        axisLabel: { color: '#000000', fontSize: 13 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: axisMaximum,
        interval: axisMaximum <= 20 ? 5 : 10,
        name: 'Cơ cấu (%)',
        nameTextStyle: { color: '#000000', fontSize: 13 },
        axisLabel: { formatter: (value: number) => `${value}%`, color: '#000000' },
        splitLine: { lineStyle: { color: '#d9dfe3', type: 'dashed' } },
      },
      series: outcomeSeries.map((item) => ({
        name: item.label,
        type: 'line',
        smooth: 0.35,
        smoothMonotone: 'x',
        symbol: 'circle',
        symbolSize: 7,
        connectNulls: false,
        data: data.map((point, index) => {
          if (!point.complete || point.totalOutcome <= 0) return null;
          const value = point[item.key] / point.totalOutcome * 100;
          if (!compact) return value;
          const isFirst = index === 0;
          const isLast = index === data.length - 1;
          const show = isFirst || isLast;
          return {
            value,
            label: item.key === 'workStudyTransferCount' && show
              ? { show, position: isFirst ? 'right' : 'left', distance: 6 }
              : { show, offset: [isFirst ? 8 : isLast ? -8 : 0, 0] },
          };
        }),
        lineStyle: { width: 2.3, cap: 'round', join: 'round' },
        itemStyle: { color: item.color, borderColor: '#fff', borderWidth: 1.5 },
        label: {
          show: !compact,
          position: item.labelPosition,
          distance: compact ? 7 : 11,
          color: item.color,
          fontSize: 13,
          fontWeight: 650,
          backgroundColor: 'rgba(255, 255, 255, .92)',
          borderRadius: 2,
          padding: [2, 3],
          formatter: (params: CallbackDataParams) => typeof params.value === 'number'
            ? formatPercent(params.value)
            : '',
        },
        labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
        emphasis: { focus: 'series' },
      })),
      media: [{
        query: { maxWidth: 720 },
        option: {
          legend: { orient: 'horizontal', left: 'center', right: 'auto', top: 0 },
          grid: { top: 72, right: 20, bottom: 46, left: 52 },
        },
      }],
    };
  }, [compact, data]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const chart = echarts.init(host, undefined, { renderer: 'canvas' });
    chart.setOption(option, { notMerge: true });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(host);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option]);

  return <div ref={hostRef} className="graduation-year-chart" />;
}

export function GraduationYearVolumeChart({ data }: GraduationOutcomeTrendChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const option = useMemo<EChartsOption>(() => {
    const maximumTotal = Math.max(0, ...data.map((point) => point.totalOutcome));
    const axisStep = maximumTotal >= 1000 ? 500 : maximumTotal >= 100 ? 50 : maximumTotal >= 10 ? 5 : 1;
    const axisMaximum = Math.max(axisStep, Math.ceil(maximumTotal * 1.18 / axisStep) * axisStep);

    return {
      animationDuration: 180,
      aria: { enabled: true },
      color: outcomeSeries.map((item) => item.color),
      tooltip: {
        trigger: 'item',
        formatter: (rawParams: CallbackDataParams | CallbackDataParams[]) => {
          const params = Array.isArray(rawParams) ? rawParams[0] : rawParams;
          if (!params || typeof params.seriesIndex !== 'number') return '';
          const point = data[params.dataIndex];
          if (!point) return '';
          if (params.seriesIndex === outcomeSeries.length) {
            return [
              `<strong>Năm ${escapeHtml(point.reviewYear)}</strong>`,
              `${typeof params.marker === 'string' ? params.marker : ''}${totalSeries.label}: <strong>${escapeHtml(formatNumber(point.totalOutcome))}</strong>`,
            ].join('<br/>');
          }
          const item = outcomeSeries[params.seriesIndex];
          if (!item) return '';
          const count = point[item.key];
          const rate = point.totalOutcome > 0 ? count / point.totalOutcome * 100 : 0;
          return [
            `<strong>Năm ${escapeHtml(point.reviewYear)}</strong>`,
            `${typeof params.marker === 'string' ? params.marker : ''}${escapeHtml(item.label)}: <strong>${escapeHtml(formatNumber(count))}</strong> sinh viên`,
            `Cơ cấu: ${escapeHtml(formatPercent(rate))}`,
            `Tổng năm: ${escapeHtml(formatNumber(point.totalOutcome))} sinh viên`,
          ].join('<br/>');
        },
      },
      legend: {
        data: [...outcomeSeries.map((item) => item.label), totalSeries.label],
        bottom: 0,
        left: 'center',
        itemWidth: 13,
        itemHeight: 8,
        textStyle: { color: '#000000', fontSize: 13 },
      },
      grid: { top: 52, right: 28, bottom: 68, left: 68 },
      xAxis: {
        type: 'category',
        data: data.map((point) => String(point.reviewYear)),
        name: 'Năm xét',
        nameLocation: 'middle',
        nameGap: 30,
        axisTick: { alignWithLabel: true },
        axisLabel: { color: '#000000', fontSize: 13 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: axisMaximum,
        interval: axisStep,
        name: 'Số sinh viên',
        nameTextStyle: { color: '#000000', fontSize: 13 },
        axisLabel: { formatter: (value: number) => formatNumber(value), color: '#000000' },
        splitLine: { lineStyle: { color: '#d9dfe3', type: 'dashed' } },
      },
      series: [
        ...outcomeSeries.map((item) => ({
          name: item.label,
          type: 'bar' as const,
          stack: 'outcomes',
          barMaxWidth: 120,
          data: data.map((point) => point.complete ? point[item.key] : null),
          itemStyle: { color: item.color },
          label: {
            show: true,
            position: 'inside' as const,
            color: '#fff',
            fontSize: 13,
            fontWeight: 650,
            textBorderColor: 'rgba(0, 0, 0, .18)',
            textBorderWidth: 2,
            formatter: (params: CallbackDataParams) => {
              if (typeof params.value !== 'number' || params.value <= 0) return '';
              return params.value / axisMaximum >= 0.045 ? formatNumber(params.value) : '';
            },
          },
          emphasis: { focus: 'self' as const },
        })),
        {
          name: totalSeries.label,
          type: 'line',
          smooth: 0.28,
          smoothMonotone: 'x',
          symbol: 'circle',
          symbolSize: 8,
          z: 10,
          data: data.map((point) => point.complete ? point.totalOutcome : null),
          lineStyle: { color: totalSeries.color, width: 2.3, cap: 'round', join: 'round' },
          itemStyle: { color: totalSeries.color, borderColor: '#fff', borderWidth: 1.5 },
          label: {
            show: true,
            position: 'top',
            distance: 12,
            color: totalSeries.color,
            fontSize: 13,
            fontWeight: 700,
            backgroundColor: 'rgba(255, 255, 255, .92)',
            borderRadius: 2,
            padding: [2, 3],
            formatter: (params: CallbackDataParams) => typeof params.value === 'number'
              ? formatNumber(params.value)
              : '',
          },
          labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
          emphasis: { focus: 'series' },
        },
      ],
      media: [{
        query: { maxWidth: 720 },
        option: {
          grid: { top: 52, right: 20, bottom: 94, left: 58 },
          legend: { bottom: 0, width: '90%' },
        },
      }],
    };
  }, [data]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const chart = echarts.init(host, undefined, { renderer: 'canvas' });
    chart.setOption(option, { notMerge: true });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(host);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option]);

  return <div ref={hostRef} className="graduation-year-chart" />;
}
