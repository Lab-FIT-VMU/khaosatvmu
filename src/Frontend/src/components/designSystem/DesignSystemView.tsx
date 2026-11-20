import { RotateCcw } from 'lucide-react';
import {
  applyDesignPreset,
  designPresets,
  designTokens,
  isDesignTokenCustom,
  resetDesignTokens,
  setDesignToken,
  useDesignTokens,
  type DesignTokenGroup,
} from '../../utils/designTokens';
import { FlagChips, MarkerChips, SectionCard, StableChips } from '../courseGrades/courseGradeUi';

/*
  Trang "Design System" chung: một bộ màu cho cả các bảng thống kê khảo sát lẫn Phân tích điểm
  học phần. Bấm vào ô màu là đổi; đổi ở đây (hoặc ở nút "Màu" cạnh các bảng thống kê) thì mọi
  trang đổi theo. Mỗi người tự chỉnh, lưu trên trình duyệt (utils/designTokens.ts).
*/

const RULES: [string, string][] = [
  ['M1', 'Không dùng đỏ, cam, xanh lá để biểu thị số liệu, không dùng kiểu đèn giao thông. Không màu nào gợi ý “tốt” hay “xấu”. Màu đỏ chỉ dùng cho đường ngưỡng / trung vị trên biểu đồ.'],
  ['M2', 'Độ lớn (mức tản, tỷ lệ, khoảng cách): một tông xanh dương từ nhạt đến đậm.'],
  ['M3', 'Chiều lệch (trên / dưới kỳ vọng): hai màu ngang hàng, không mang nghĩa giá trị — xanh mòng két (trên) và tím (dưới), điểm giữa xám nhạt.'],
  ['M4', 'Phân loại (khoa, bộ môn): bảng màu trung tính. Nhiều hơn 6 nhóm thì chia khung hoặc chỉ tô nhóm đang chọn.'],
  ['M5', 'Điểm lưu ý, đặc điểm lớp, trạng thái ổn định thể hiện bằng nhãn ghi tên đầy đủ kèm ký hiệu trung tính (◆ ▲ ▼ ■ ●), không tô màu cả dòng.'],
];

/** Các màu của một nhóm: mỗi ô một ô chọn màu, kèm mã màu và dấu "đã chỉnh". */
function EditableSwatches({ group, colors }: { group: DesignTokenGroup; colors: Record<string, string> }) {
  const tokens = designTokens.filter((token) => token.group === group);
  return (
    <div className="cga-swatches">
      {tokens.map((token) => (
        <label key={token.key} className="cga-swatch ds-swatch">
          <input
            type="color"
            value={colors[token.key]}
            onChange={(event) => setDesignToken(token.key, event.target.value)}
            aria-label={`Màu "${token.label}"`}
          />
          <b>{token.label}</b>
          <span>
            {colors[token.key].toUpperCase()}
            {isDesignTokenCustom(token.key) && <em className="ds-swatch__custom"> · đã chỉnh</em>}
          </span>
        </label>
      ))}
    </div>
  );
}

/** Nút trả các màu của một hoặc nhiều nhóm về mặc định. */
function ResetGroups({ groups }: { groups: readonly DesignTokenGroup[] }) {
  const keys = designTokens.filter((token) => groups.includes(token.group)).map((token) => token.key);
  const custom = keys.some((key) => isDesignTokenCustom(key));
  return (
    <button type="button" className="btn btn-secondary btn-sm" disabled={!custom} onClick={() => resetDesignTokens(keys)}>
      <RotateCcw size={14} aria-hidden="true" /> Về mặc định
    </button>
  );
}

export function DesignSystemView() {
  const colors = useDesignTokens();
  const toned = designTokens.filter((token) => token.tone);
  const activePreset = designPresets.find((preset) =>
    toned.every((token) => colors[token.key] === preset.colors[token.tone!].toLowerCase()));

  return (
    <div className="cga-stack">
      <SectionCard
        title="Bộ màu gợi ý cho bảng thống kê khảo sát"
        description="Bấm một bộ là đổi cả màu trạng thái lẫn màu số liệu của các bảng thống kê khảo sát. Màu chỉ áp trên máy của bạn."
      >
        <div className="ds-presets">
          {designPresets.map((preset) => (
            <button
              type="button"
              key={preset.name}
              className={`ds-preset${activePreset === preset ? ' is-active' : ''}`}
              aria-pressed={activePreset === preset}
              onClick={() => applyDesignPreset(preset.colors)}
            >
              <span className="ds-preset__swatches" aria-hidden="true">
                <i style={{ background: preset.colors.success }} />
                <i style={{ background: preset.colors.warning }} />
                <i style={{ background: preset.colors.danger }} />
              </span>
              {preset.name}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Trạng thái trong bảng thống kê khảo sát"
        description="Tiến độ thu phiếu, Bảng dữ liệu khảo sát, cột Phiếu của Ý kiến mở — cả học phần, CTĐT và giảng viên."
        actions={<ResetGroups groups={['survey-status']} />}
      >
        <EditableSwatches group="survey-status" colors={colors} />
      </SectionCard>

      <SectionCard
        title="Số liệu trong Thống kê & Báo cáo"
        description="Tỷ lệ phản hồi, điểm trung bình và số phiếu không hợp lệ trên các bảng Thống kê & Báo cáo."
        actions={<ResetGroups groups={['survey-report']} />}
      >
        <EditableSwatches group="survey-report" colors={colors} />
      </SectionCard>

      <SectionCard
        title="Nhận diện và giao diện"
        description="Màu thương hiệu VMU và các màu nhấn của thẻ số liệu (Phân tích điểm học phần)."
        actions={<ResetGroups groups={['brand']} />}
      >
        <EditableSwatches group="brand" colors={colors} />
      </SectionCard>

      <SectionCard
        title="Màu số liệu của Phân tích điểm học phần"
        description="Độ lớn (M2) · Chiều lệch (M3) · Phân loại (M4) · Các màu khác trên biểu đồ."
        actions={<ResetGroups groups={['grade-scale', 'grade-direction', 'grade-categories', 'grade-other']} />}
      >
        <div className="cga-stack">
          <EditableSwatches group="grade-scale" colors={colors} />
          <EditableSwatches group="grade-direction" colors={colors} />
          <EditableSwatches group="grade-categories" colors={colors} />
          <EditableSwatches group="grade-other" colors={colors} />
        </div>
      </SectionCard>

      <SectionCard title="Quy tắc màu số liệu" description="Bộ luật D mục 9.2 — áp cho mọi biểu đồ và bảng của Phân tích điểm học phần. Khi tự chỉnh màu nên giữ đúng các quy tắc này.">
        <dl className="cga-gloss">
          {RULES.map(([code, text]) => (
            <div key={code}>
              <dt>{code}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      <SectionCard title="Thành phần" description="Nút, nhãn điểm lưu ý, đặc điểm lớp, trạng thái ổn định và thẻ ghi chú.">
        <div className="cga-stack">
          <div className="cga-swatch-row">
            <button type="button" className="btn btn-primary">Nút chính</button>
            <button type="button" className="btn btn-secondary">Nút phụ</button>
            <button type="button" className="cga-link">Liên kết</button>
            <button type="button" className="btn btn-primary" disabled>Vô hiệu</button>
          </div>
          <div className="cga-swatch-row">
            <FlagChips codes={['H1']} />
            <MarkerChips codes={['D6', 'D2', 'D3']} />
            <StableChips codes={['O1']} pending={['O3']} />
            <span className="cga-tag">Ít sinh viên – đọc thận trọng</span>
            <span className="cga-tag">Không đưa vào thống kê</span>
          </div>
          <div className="cga-swatch-row">
            <span className="operations-status operations-status--success" style={{ color: colors.success }}>Đạt chỉ tiêu</span>
            <span className="operations-status operations-status--warning" style={{ color: colors.warning }}>Đang thu</span>
            <span className="operations-status operations-status--danger" style={{ color: colors.danger }}>Không đạt chỉ tiêu</span>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
