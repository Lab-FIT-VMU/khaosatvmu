import { useCallback, useEffect, useState } from 'react';
import { surveyApi } from '../services/surveyApi';
import type { SemesterSurvey } from '../types';

/**
 * Danh sách đợt khảo sát của một học kỳ đã nạp, giữ ở cấp module nên sống qua cả
 * việc chuyển trang. Mỗi trang trước đây tự gọi API riêng, nên mở trang nào cũng
 * thấy ô chọn trống rồi mới có dữ liệu.
 */
const cache = new Map<number, SemesterSurvey[]>();

/** Xoá cache sau khi tạo, sửa hoặc xoá đợt, để ô chọn không giữ danh sách cũ. */
export function clearSemesterSurveysCache(semesterId?: number): void {
  if (semesterId === undefined) cache.clear();
  else cache.delete(semesterId);
}

/**
 * Đọc và ghi cache từ bên ngoài hook, dành cho chỗ tự gọi API danh sách đợt — ví dụ
 * App nạp sẵn cho trang Tiến độ. Nhờ vậy mọi trang dùng chung một bản, mở trang nào
 * cũng có dữ liệu ngay.
 */
export function readSemesterSurveysCache(semesterId: number): SemesterSurvey[] | undefined {
  return cache.get(semesterId);
}

export function writeSemesterSurveysCache(semesterId: number, surveys: SemesterSurvey[]): void {
  cache.set(semesterId, surveys);
}

interface SemesterSurveysState {
  semesterSurveys: SemesterSurvey[];
  /** Đang gọi API và CHƯA có gì để hiện — chỉ đúng ở lần nạp đầu của một học kỳ. */
  loading: boolean;
  error: unknown;
  reload: () => void;
}

/**
 * Đợt khảo sát của một học kỳ, dùng chung cho mọi trang có ô chọn "Đợt khảo sát".
 *
 * Học kỳ đã nạp rồi thì trả dữ liệu NGAY từ cache, đồng thời gọi lại API ở nền để
 * số liệu không cũ. Nhờ vậy chuyển qua lại giữa các trang không còn cảnh ô chọn
 * nháy "Chưa có đợt nào" một nhịp rồi mới hiện danh sách.
 */
export function useSemesterSurveys(semesterId: string | number | null | undefined): SemesterSurveysState {
  const numericId = Number(semesterId);
  const hasSemester = Number.isInteger(numericId) && numericId > 0;

  const [semesterSurveys, setSemesterSurveys] = useState<SemesterSurvey[]>(
    () => (hasSemester ? cache.get(numericId) ?? [] : []),
  );
  const [loading, setLoading] = useState(() => hasSemester && !cache.has(numericId));
  const [error, setError] = useState<unknown>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    if (hasSemester) cache.delete(numericId);
    setReloadToken((token) => token + 1);
  }, [hasSemester, numericId]);

  useEffect(() => {
    if (!hasSemester) {
      setSemesterSurveys([]);
      setLoading(false);
      setError(null);
      return;
    }

    // Có sẵn trong cache thì hiện ngay, và lần gọi API bên dưới chỉ để làm mới.
    const cached = cache.get(numericId);
    setSemesterSurveys(cached ?? []);
    setLoading(cached === undefined);
    setError(null);

    let cancelled = false;
    void (async () => {
      try {
        const next = await surveyApi.semesterSurveys(numericId);
        if (cancelled) return;
        cache.set(numericId, next);
        setSemesterSurveys(next);
        setError(null);
      } catch (caught) {
        if (!cancelled) setError(caught);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasSemester, numericId, reloadToken]);

  return { semesterSurveys, loading, error, reload };
}
