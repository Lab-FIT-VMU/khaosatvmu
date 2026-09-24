import { useEffect, useState } from 'react';
import { surveyApi, type SurveyPublication } from '../services/surveyApi';

/**
 * Trạng thái phát hành của một đợt, dùng chung giữa nút Phát hành và nút Cập nhật điểm.
 * Bấm phát hành hay thu hồi ở một nút thì nút kia trên cùng màn hình đổi theo ngay, không
 * phải tải lại trang.
 */
const listeners = new Set<(value: SurveyPublication) => void>();

/** Báo trạng thái mới cho mọi nút đang mở. Gọi sau khi đọc hoặc đổi trạng thái. */
export function publishSurveyPublication(value: SurveyPublication): void {
  listeners.forEach((listener) => listener(value));
}

/** Trạng thái phát hành của đợt; null khi chưa chọn đợt hoặc chưa đọc được. */
export function useSurveyPublication(semesterSurveyId: number | null): SurveyPublication | null {
  const [publication, setPublication] = useState<SurveyPublication | null>(null);

  useEffect(() => {
    setPublication(null);
    if (!semesterSurveyId) return;

    let cancelled = false;
    const listener = (value: SurveyPublication) => {
      if (value.semesterSurveyId === semesterSurveyId) setPublication(value);
    };
    listeners.add(listener);

    surveyApi
      .surveyPublication(semesterSurveyId)
      .then((value) => {
        if (!cancelled) setPublication(value);
      })
      .catch(() => {
        // Không đọc được thì coi như chưa biết; chỗ gọi tự quyết định khi null.
      });

    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, [semesterSurveyId]);

  return publication;
}
