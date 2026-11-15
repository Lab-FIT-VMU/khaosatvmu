import { COLORS } from './courseGradeFormat';
import { FlagChips, MarkerChips, SectionCard, StableChips } from './courseGradeUi';

/*
  Trang "Design System" của module (như trang #ds của bản audit): bảng màu, quy tắc màu số liệu
  M1–M5 của bộ luật D mục 9.2 và các thành phần dùng chung. Chỉ để xem, không đổi được màu.
*/

interface Swatch {
  name: string;
  /** Biến CSS (var(--…)) hoặc mã màu. */
  color: string;
  code: string;
}

const cssVar = (name: string, code: string): Swatch => ({ name, color: `var(${name})`, code });

const BRAND: Swatch[] = [
  { ...cssVar('--cga-brand-900', '#0A2463'), name: 'VMU 900' },
  { ...cssVar('--cga-brand-800', '#0D3B8C'), name: 'VMU 800' },
  { ...cssVar('--cga-brand-700', '#1450B8'), name: 'VMU 700' },
  { ...cssVar('--cga-brand-100', '#DCE8FC'), name: 'VMU 100' },
  { name: 'Nhấn xanh', color: '#1D63D6', code: '#1D63D6' },
  { name: 'Nhấn mòng két', color: '#138A8A', code: '#138A8A' },
  { name: 'Nhấn tím', color: '#6A55C2', code: '#6A55C2' },
  { name: 'Nhấn chàm', color: '#2E3F9E', code: '#2E3F9E' },
];

const DATA_SCALE: Swatch[] = COLORS.scale.map((code, index) => ({ name: `Mức ${index + 1}`, color: code, code }));

const DIRECTION: Swatch[] = [
  { name: 'Trên kỳ vọng', color: COLORS.up, code: COLORS.up },
  { name: 'Giữa', color: COLORS.middle, code: COLORS.middle },
  { name: 'Dưới kỳ vọng', color: COLORS.down, code: COLORS.down },
];

const CATEGORIES: Swatch[] = COLORS.categories.map((code, index) => ({ name: `Nhóm ${index + 1}`, color: code, code }));

const OTHERS: Swatch[] = [
  { name: 'Điểm quá trình', color: '#1D63D6', code: '#1D63D6' },
  { name: 'Điểm thi', color: '#1F2633', code: '#1F2633' },
  { name: 'Ổn định, đồng đều', color: 'var(--cga-ok)', code: '#0F5E5E' },
  { name: 'Đường ngưỡng / trung vị', color: '#D32F2F', code: '#D32F2F' },
];

const RULES: [string, string][] = [
  ['M1', 'Không dùng đỏ, cam, xanh lá để biểu thị số liệu, không dùng kiểu đèn giao thông. Không màu nào gợi ý “tốt” hay “xấu”. Màu đỏ chỉ dùng cho đường ngưỡng / trung vị trên biểu đồ.'],
  ['M2', 'Độ lớn (mức tản, tỷ lệ, khoảng cách): một tông xanh dương từ nhạt đến đậm.'],
  ['M3', 'Chiều lệch (trên / dưới kỳ vọng): hai màu ngang hàng, không mang nghĩa giá trị — xanh mòng két (trên) và tím (dưới), điểm giữa xám nhạt.'],
  ['M4', 'Phân loại (khoa, bộ môn): bảng màu trung tính. Nhiều hơn 6 nhóm thì chia khung hoặc chỉ tô nhóm đang chọn.'],
  ['M5', 'Điểm lưu ý, đặc điểm lớp, trạng thái ổn định thể hiện bằng nhãn ghi tên đầy đủ kèm ký hiệu trung tính (◆ ▲ ▼ ■ ●), không tô màu cả dòng.'],
];

function SwatchGrid({ swatches }: { swatches: Swatch[] }) {
  return (
    <div className="cga-swatches">
      {swatches.map((swatch) => (
        <div key={swatch.name} className="cga-swatch">
          <i style={{ background: swatch.color }} aria-hidden="true" />
          <b>{swatch.name}</b>
          <span>{swatch.code}</span>
        </div>
      ))}
    </div>
  );
}

export function DesignSystemView() {
  return (
    <div className="cga-stack">
      <SectionCard title="Nhận diện và giao diện" description="Màu thương hiệu VMU và các màu nhấn của thẻ số liệu.">
        <SwatchGrid swatches={BRAND} />
      </SectionCard>

      <SectionCard title="Màu số liệu" description="Độ lớn (M2) · Chiều lệch (M3) · Phân loại (M4) · Các màu khác trên biểu đồ.">
        <div className="cga-stack">
          <SwatchGrid swatches={DATA_SCALE} />
          <SwatchGrid swatches={DIRECTION} />
          <SwatchGrid swatches={CATEGORIES} />
          <SwatchGrid swatches={OTHERS} />
        </div>
      </SectionCard>

      <SectionCard title="Quy tắc màu số liệu" description="Bộ luật D mục 9.2 — bắt buộc cho mọi biểu đồ và bảng của module.">
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
        </div>
      </SectionCard>
    </div>
  );
}
