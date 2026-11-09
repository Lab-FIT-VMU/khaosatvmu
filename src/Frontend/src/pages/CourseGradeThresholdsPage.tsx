import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, LoaderCircle, RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/Modal';
import { courseGradeAnalysisApi } from '../services/courseGradeAnalysisApi';
import { courseGradeErrorMessage } from '../services/courseGradesApi';
import type { ThresholdItem, ThresholdSet } from '../types/courseGradeAnalysis';
import '../styles/course-grade-reports.css';

/*
  Phân tích điểm học phần → Ngưỡng phân tích (bộ luật D, E).

  Ai sửa được do quyền COURSE_GRADE_THRESHOLDS_ACCESS; vai trò chỉ đọc chỉ xem. Lưu có thay đổi
  thì tăng phiên bản ngưỡng và tính lại mọi kỳ. Báo cáo gửi Ban giám hiệu đề nghị chốt ngưỡng
  một lần sau thí điểm rồi giữ cố định: đổi liên tục thì tỷ lệ học phần có điểm lưu ý không còn
  so được giữa các kỳ.
*/

type Draft = Record<string, string>;

const toText = (t: ThresholdItem, which: 'current' | 'default'): string => {
  const numeric = which === 'current' ? t.numericValue : t.defaultNumericValue;
  const bool = which === 'current' ? t.booleanValue : t.defaultBooleanValue;
  const list = which === 'current' ? t.textListValue : t.defaultTextListValue;
  if (t.valueType === 'boolean') return bool ? 'true' : 'false';
  if (t.valueType === 'text_list') return (list ?? []).join(', ');
  return numeric === null ? '' : String(numeric);
};

export function CourseGradeThresholdsPage() {
  const [data, setData] = useState<ThresholdSet | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = () => courseGradeAnalysisApi.thresholds()
    .then((set) => {
      setData(set);
      setDraft(Object.fromEntries(set.thresholds.map((t) => [t.code, toText(t, 'current')])));
    })
    .catch((loadError) => setError(courseGradeErrorMessage(loadError, 'Không tải được ngưỡng phân tích.')));

  useEffect(() => { void load(); }, []);

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; items: ThresholdItem[] }>();
    for (const t of data?.thresholds ?? []) {
      const group = map.get(t.groupCode) ?? { name: t.groupName, items: [] };
      group.items.push(t);
      map.set(t.groupCode, group);
    }
    return [...map.values()];
  }, [data]);

  const changed = (data?.thresholds ?? []).filter((t) => (draft[t.code] ?? '') !== toText(t, 'current'));

  const save = async () => {
    if (!data || changed.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const result = await courseGradeAnalysisApi.saveThresholds(changed.map((t) => {
        const text = draft[t.code] ?? '';
        return {
          code: t.code,
          numericValue: t.valueType === 'integer' || t.valueType === 'decimal' ? Number(text.replace(',', '.')) : null,
          booleanValue: t.valueType === 'boolean' ? text === 'true' : null,
          textListValue: t.valueType === 'text_list' ? text.split(',').map((x) => x.trim()).filter(Boolean) : null,
        };
      }));
      toast.success(`Đã lưu ${result.changedCount} ngưỡng (phiên bản ${result.version}). Mọi kỳ sẽ được tính lại.`);
      await load();
    } catch (saveError) {
      setError(courseGradeErrorMessage(saveError, 'Không lưu được ngưỡng.'));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setConfirmReset(false);
    setSaving(true);
    try {
      const result = await courseGradeAnalysisApi.resetThresholds();
      toast.success(result.changedCount > 0
        ? `Đã khôi phục ${result.changedCount} ngưỡng về mặc định. Mọi kỳ sẽ được tính lại.`
        : 'Mọi ngưỡng đang ở giá trị mặc định.');
      await load();
    } catch (resetError) {
      setError(courseGradeErrorMessage(resetError, 'Không khôi phục được ngưỡng mặc định.'));
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <div className="cga-page">
        {error ? <div className="cga-alert" role="alert"><CircleAlert size={16} /> {error}</div>
          : <div className="cga-state"><LoaderCircle className="spin" /> Đang tải ngưỡng...</div>}
      </div>
    );
  }

  return (
    <div className="cga-page">
      <header className="cga-heading">
        <div className="cga-heading__title">
          <SlidersHorizontal size={20} aria-hidden="true" />
          <div>
            <h2>Ngưỡng phân tích</h2>
            <p>
              Phiên bản {data.version}. Lưu thay đổi sẽ tính lại mọi học kỳ. Nên chốt ngưỡng một lần sau thí điểm rồi giữ cố định,
              để tỷ lệ học phần có điểm lưu ý còn so được giữa các kỳ.
            </p>
          </div>
        </div>
        {data.canEdit && (
          <div className="cga-actions">
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setConfirmReset(true)}>
              <RotateCcw size={16} /> Khôi phục mặc định
            </button>
            <button type="button" className="btn btn-primary" disabled={saving || changed.length === 0} onClick={() => void save()}>
              {saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Lưu {changed.length > 0 ? `(${changed.length})` : ''}
            </button>
          </div>
        )}
      </header>

      {!data.canEdit && <div className="cga-info">Vai trò của bạn chỉ được xem ngưỡng.</div>}
      {error && <div className="cga-alert" role="alert"><CircleAlert size={16} /> {error}</div>}

      {groups.map((group) => (
        <section key={group.name} className="cga-card">
          <header className="cga-card__header"><div><h3>{group.name}</h3></div></header>
          <div className="cga-table-wrap">
            <table className="cga-table">
              <thead>
                <tr><th>Ngưỡng</th><th>Áp dụng</th><th className="cga-col-input">Giá trị</th><th className="num">Mặc định</th></tr>
              </thead>
              <tbody>
                {group.items.map((t) => {
                  const value = draft[t.code] ?? '';
                  const isChanged = value !== toText(t, 'current');
                  return (
                    <tr key={t.code} className={isChanged ? 'cga-row-changed' : undefined}>
                      <td>
                        <strong>{t.displayName}</strong>
                        {t.description && <p className="cga-muted cga-description">{t.description}</p>}
                      </td>
                      <td><span className="cga-code">{t.ruleReference}</span></td>
                      <td className="cga-col-input">
                        {t.valueType === 'boolean' ? (
                          <select disabled={!data.canEdit} value={value} onChange={(event) => setDraft({ ...draft, [t.code]: event.target.value })}>
                            <option value="true">Có</option>
                            <option value="false">Không</option>
                          </select>
                        ) : (
                          <input
                            disabled={!data.canEdit}
                            inputMode={t.valueType === 'text_list' ? 'text' : 'decimal'}
                            value={value}
                            placeholder={t.valueType === 'text_list' ? 'Cách nhau bằng dấu phẩy' : undefined}
                            onChange={(event) => setDraft({ ...draft, [t.code]: event.target.value })}
                          />
                        )}
                        {t.unit && <small className="cga-muted cga-unit"> {t.unit}</small>}
                      </td>
                      <td className="num cga-muted">{t.valueType === 'boolean' ? (t.defaultBooleanValue ? 'Có' : 'Không') : toText(t, 'default') || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <ConfirmDialog
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => void reset()}
        title="Khôi phục ngưỡng mặc định"
        recordName="mọi ngưỡng phân tích"
        confirmText="Khôi phục"
        confirmVariant="primary"
        message="Mọi ngưỡng sẽ về giá trị mặc định và mọi học kỳ sẽ được tính lại."
      />
    </div>
  );
}

export default CourseGradeThresholdsPage;
