/**
 * Ngưỡng dùng chung cho mọi màn hình đọc số khảo sát. PHẢI trùng với
 * `ReportThresholds` bên backend (src/Backend/Application/Surveys/ReportThresholds.cs)
 * — hai bên lệch nhau thì cùng một lớp sẽ được gắn nhãn "Hoàn thành" ở trang này
 * mà lại bị bỏ khỏi điểm ở trang kia, không ai hiểu nổi tại sao.
 */

/**
 * Từ mốc này trở lên thì lớp được gắn nhãn "Đạt chỉ tiêu" trên bảng tiến độ.
 * CHỈ dùng để gắn nhãn tiến độ — điều kiện lớp có được tính vào điểm hay không
 * nằm ở `ScoringThresholds` bên dưới và do quản trị đặt trên giao diện.
 */
export const COMPLETED_COMPLETION_RATE = 50;

/** Dưới mốc này thì lớp bị coi là chậm tiến độ. Giữa hai mốc là "đang thu". */
export const LAGGING_COMPLETION_RATE = 20;

/**
 * Bốn bậc tô màu ô điểm trung bình: đỏ → cam → vàng → xanh. PHẢI trùng
 * `ReportThresholds.LowScore` / `FairScore` / `GoodScore` bên backend, không thì
 * cùng một lớp lại được tô hai màu ở hai trang.
 */
export const LOW_SCORE = 3.2;
export const FAIR_SCORE = 3.5;
export const GOOD_SCORE = 3.8;

/** Lớp CSS của ô điểm, dùng chung cho mọi bảng điểm dựng tay. */
export const scoreBandClass = (score: number | null): string => {
  if (score === null) return 'num';
  if (score < LOW_SCORE) return 'num score-band score-band--bad';
  if (score < FAIR_SCORE) return 'num score-band score-band--poor';
  if (score < GOOD_SCORE) return 'num score-band score-band--fair';
  return 'num score-band score-band--good';
};

/**
 * Chênh lệch dưới nửa bậc điểm thì coi như ngang nhau. Giữ ở đây để mọi bảng so
 * sánh trên trang báo cáo tô cùng một ngưỡng.
 */
export const SCORE_DELTA_TOLERANCE = 0.15;

/** Lớp CSS của ô chênh lệch điểm: trên mặt bằng thì xanh, dưới thì cam. */
export const scoreDeltaClass = (delta: number | null): string => {
  if (delta === null || Math.abs(delta) < SCORE_DELTA_TOLERANCE) return 'num';
  return delta > 0 ? 'num score-band score-band--good' : 'num score-band score-band--poor';
};

/** Tỷ lệ hoàn thành của một lớp: phiếu hợp lệ chia sĩ số, theo phần trăm. */
export const completionRateOf = (validResponseCount: number, classSize: number): number =>
  classSize > 0 ? (validResponseCount / classSize) * 100 : 0;

/**
 * Hai vòng lọc quyết định một lớp có được tính vào điểm hay không, do quản trị
 * đặt trên giao diện. Bản sao của `ScoringThresholds` bên backend.
 */
export interface ScoringThresholds {
  /** Vòng 1 — Số phiếu đã thu ÷ Sĩ số, phần trăm. */
  minimumResponseRate: number;
  /** Vòng 2 — Số phiếu hợp lệ ÷ Số phiếu đã thu, phần trăm. */
  minimumValidRate: number;
  /**
   * Ba luật của bộ lọc nhiễu có đang được áp không. Tắt một luật thì phiếu chỉ
   * dính đúng luật đó quay lại được tính vào thống kê — phiếu không bị ghi lại,
   * chỉ đổi cách đọc lý do đã lưu từ lúc nộp.
   */
  rejectTooFast: boolean;
  rejectSingleAnswer: boolean;
  rejectAttentionCheckFailed: boolean;
}

/**
 * Mặc định của hệ thống. Dùng khi chưa tải được cấu hình từ API — phải trùng
 * `ScoringThresholds.Default` bên backend.
 */
export const DEFAULT_SCORING_THRESHOLDS: ScoringThresholds = {
  minimumResponseRate: 50,
  minimumValidRate: 80,
  rejectTooFast: true,
  rejectSingleAnswer: true,
  rejectAttentionCheckFailed: true,
};

/** Tỷ lệ phản hồi: số phiếu đã thu chia sĩ số, theo phần trăm. */
export const responseRateOf = (totalResponseCount: number, classSize: number): number =>
  classSize > 0 ? (totalResponseCount / classSize) * 100 : 0;

/** Tỷ lệ phiếu hợp lệ: phiếu hợp lệ chia số phiếu đã thu, theo phần trăm. */
export const validRateOf = (validResponseCount: number, totalResponseCount: number): number =>
  totalResponseCount > 0 ? (validResponseCount / totalResponseCount) * 100 : 0;

/**
 * Lớp phải qua CẢ HAI vòng mới được gộp vào điểm. Vòng 1 loại lớp quá ít người
 * trả lời, vòng 2 loại lớp nộp nhiều nhưng phần lớn phiếu bị bộ lọc đánh rớt.
 */
export const hasEnoughResponsesToScore = (
  classSize: number,
  totalResponseCount: number,
  validResponseCount: number,
  thresholds: ScoringThresholds = DEFAULT_SCORING_THRESHOLDS,
): boolean => {
  if (classSize <= 0 || totalResponseCount <= 0) return false;
  if (responseRateOf(totalResponseCount, classSize) < thresholds.minimumResponseRate) return false;
  return validRateOf(validResponseCount, totalResponseCount) >= thresholds.minimumValidRate;
};
