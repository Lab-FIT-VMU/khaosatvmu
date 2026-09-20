import React from 'react';
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  Clock,
  GraduationCap,
  MessageSquare,
  Send,
  UserRound,
} from 'lucide-react';
import type { SurveyFormConfig } from '../types';
import {
  coverStyleOf,
  isFieldVisible,
  textOr,
  textStyleOf,
  themeStyleOf,
  titleStyleOf,
} from '../utils/surveyForm';
import '../styles/public-survey.css';

/**
 * Xem trước phiếu, dựng bằng ĐÚNG lớp CSS của phiếu thật (`public-survey.css`) và đúng
 * các hàm hình thức dùng chung (`utils/surveyForm`), nên màu, phông và những khối được
 * bật ở đây là thứ sinh viên sẽ thấy.
 *
 * Số liệu là số liệu mẫu: lúc soạn phiếu chưa biết đợt sẽ phát cho lớp nào.
 *
 * Hai màn ứng với hai thẻ của màn soạn, mỗi màn xem trước đúng phần cấu hình đang sửa.
 * Màn cảm ơn và các màn chặn không soạn được nên cũng không dựng ở đây.
 */
export type SurveyPreviewScreen = 'intro' | 'quiz';

/** Các vùng bấm chọn được trên màn hình bắt đầu làm bài. */
export type SurveyFormRegion = 'cover' | 'logo' | 'title' | 'noticeHeading' | 'noticeText';

/** Những đoạn chữ sửa thẳng trên bản dựng. */
export type SurveyFormTextField = 'title' | 'introHeading' | 'intro';

/**
 * Dữ liệu dựng phiếu. Tên đợt, tên bộ câu hỏi và các câu hỏi lấy từ chính bộ quản trị
 * vừa chọn, để bản xem trước đúng là phiếu sinh viên sẽ nhận. Thông tin lớp thì vẫn là
 * số liệu mẫu: lúc soạn chưa biết đợt phát cho lớp nào.
 */
export interface SurveyPreviewData {
  surveyName: string;
  templateName: string;
  /** Mục và câu hỏi của bộ, đã xếp đúng thứ tự phiếu hiển thị. */
  sections: {
    sectionName: string;
    questions: { questionText: string; options: { value: number; displayText: string }[] }[];
  }[];
  questionCount: number;
}

/** Câu mặc định của hệ thống; vừa để hiện khi đợt bỏ trống, vừa để nhận ra "không tuỳ biến". */
const defaultNoticeHeading = 'Lưu ý';

const defaultIntro = 'Vui lòng đọc kỹ từng câu hỏi và trả lời dựa trên trải nghiệm thực tế của bạn.'
  + ' Phiếu này không ghi tên, mã sinh viên hay bất kỳ thông tin nào nhận ra bạn. Giảng viên chỉ'
  + ' nhận được kết quả tổng hợp của cả lớp, không xem được từng phiếu riêng lẻ.';

const sampleOptions = [
  { value: 1, displayText: 'Hoàn toàn không đồng ý' },
  { value: 2, displayText: 'Không đồng ý' },
  { value: 3, displayText: 'Bình thường' },
  { value: 4, displayText: 'Đồng ý' },
  { value: 5, displayText: 'Hoàn toàn đồng ý' },
];

const sample = {
  surveyName: 'Tên đợt khảo sát',
  templateName: 'Bộ câu hỏi mẫu',
  courseCode: 'MÃ HP',
  courseName: 'Tên học phần',
  sectionName: 'N01',
  lecturerName: 'Nguyễn Văn A',
  semesterName: 'Học kỳ 1',
  academicYearName: '2026 - 2027',
  credits: 3,
  facultyName: 'Khoa Hàng hải',
  departmentName: 'Bộ môn Điều khiển tàu biển',
  questionCount: 20,
  schedule: '20/09/2026 07:00 → 20/10/2026 23:59',
  sections: [
    {
      sectionName: 'I. Về học phần',
      questions: [
        {
          questionText: 'Nội dung học phần bám sát đề cương đã công bố.',
          options: sampleOptions,
        },
        {
          questionText: 'Tài liệu học tập đầy đủ và dễ tiếp cận.',
          options: sampleOptions,
        },
      ],
    },
  ],
};

/** Một ô thông tin của màn mở đầu. */
const metaItem = (icon: React.ReactNode, label: string, value: string) => (
  <div className="public-intro-meta-item" key={label}>
    {icon}
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  </div>
);

export const SurveyFormPreview: React.FC<{
  config: SurveyFormConfig;
  /** Màn nào đang xem. Mặc định là màn mở đầu. */
  screen?: SurveyPreviewScreen;
  /** Bản thu nhỏ cho thẻ mẫu: bỏ bớt phần dưới, chỉ giữ đủ để nhận ra mẫu. */
  compact?: boolean;
  /** Đợt và bộ câu hỏi thật. Thiếu thì dựng bằng số liệu mẫu. */
  data?: SurveyPreviewData;
  /** Bấm thẳng vào từng vùng trên phiếu để chọn và sửa, kiểu Google Forms. */
  editable?: boolean;
  selected?: SurveyFormRegion | null;
  onSelect?: (region: SurveyFormRegion | null) => void;
  /** Chữ vừa sửa tại chỗ; null nghĩa là trả về câu mặc định. */
  onTextChange?: (field: SurveyFormTextField, value: string | null) => void;
  /** Thanh lệnh của vùng đang chọn, do màn soạn dựng và gắn ngay cạnh vùng đó. */
  toolbar?: React.ReactNode;
}> = ({
  config,
  screen = 'intro',
  compact = false,
  data,
  editable = false,
  selected = null,
  onSelect,
  onTextChange,
  toolbar,
}) => {
  const surveyName = data?.surveyName?.trim() || sample.surveyName;
  const templateName = data?.templateName?.trim() || sample.templateName;
  const questionCount = data?.questionCount ?? sample.questionCount;
  const sections = data?.sections?.length ? data.sections : sample.sections;
  const title = textOr(config.title, surveyName);

  // Số thứ tự chạy suốt phiếu, không reset theo mục — giống phiếu sinh viên.
  let order = 0;

  // Tiến độ giả lập: coi như sinh viên vừa trả lời hai câu đầu, để thanh tiến độ và
  // lưới điều hướng có cả ô đã trả lời lẫn ô chưa, đúng số câu của bộ.
  const answeredSample = Math.min(2, questionCount);
  const progressSample = questionCount === 0
    ? 0
    : Math.round((answeredSample / questionCount) * 100);

  /**
   * Bọc một vùng sửa được: viền khi rê chuột, viền đậm khi đang chọn, và thanh lệnh
   * gắn ngay dưới vùng. Không ở chế độ sửa thì trả nguyên nội dung, để phiếu xem trước
   * ở thẻ mẫu không dính thêm thẻ div nào.
   */
  const region = (name: SurveyFormRegion, children: React.ReactNode) => {
    if (!editable) return children;

    return (
      <div
        className={`survey-region${selected === name ? ' is-selected' : ''}`}
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onSelect?.(name);
        }}
        onKeyDown={(event) => {
          // Đang gõ trong chính vùng này thì để yên: bắt phím cách ở đây là nuốt mất
          // dấu cách của người đang soạn chữ.
          const target = event.target as HTMLElement;
          if (target.isContentEditable || target.closest('input, textarea, select, button')) {
            return;
          }
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          onSelect?.(name);
        }}
      >
        {children}
        {selected === name && toolbar && (
          <div
            className="survey-region__toolbar"
            role="toolbar"
            onClick={(event) => event.stopPropagation()}
          >
            {toolbar}
          </div>
        )}
      </div>
    );
  };

  /**
   * Chữ sửa ngay trên bản dựng. Chốt lúc rời ô (onBlur) chứ không gõ tới đâu lưu tới
   * đó: gõ tới đâu lưu tới đó thì React vẽ lại giữa chừng và con trỏ nhảy về đầu dòng.
   * Gõ đúng bằng câu mặc định, hoặc xoá trắng, đều coi như không tuỳ biến.
   */
  const editableText = (
    field: SurveyFormTextField,
    value: string,
    fallback: string,
  ) => {
    if (!editable) return value;

    return (
      <span
        className="survey-region__text"
        contentEditable
        suppressContentEditableWarning
        onBlur={(event) => {
          // `innerText` chứ không phải `textContent`: gõ Enter thì trình duyệt chèn thẻ
          // <br> hoặc khối mới, `textContent` nuốt mất chỗ xuống dòng còn `innerText`
          // trả về đúng ký tự xuống dòng. Khoảng trắng cứng do trình duyệt chèn khi gõ
          // nhiều dấu cách liền nhau thì đổi về dấu cách thường.
          const next = event.currentTarget.innerText.replace(/\u00a0/g, ' ').trim();
          onTextChange?.(field, !next || next === fallback.trim() ? null : next);
        }}
      >
        {value}
      </span>
    );
  };

  const heroImage = (
    <div className="public-intro-hero">
      <img
        src={config.coverImageUrl || '/headerimg/green.png'}
        style={coverStyleOf(config)}
        alt=""
        aria-hidden="true"
      />
    </div>
  );
  const hero = editable ? region('cover', heroImage) : heroImage;

  const logoImage = config.logoUrl ? (
    <div className="public-survey-logo">
      <img src={config.logoUrl} alt="" />
    </div>
  ) : null;
  const logo = logoImage && editable ? region('logo', logoImage) : logoImage;

  // ------------------------------------------------------------ Màn mở đầu

  if (screen === 'intro') {
    const metaItems = [
      isFieldVisible(config, 'section')
        && metaItem(<ClipboardList aria-hidden="true" />, 'Lớp học phần', sample.sectionName),
      isFieldVisible(config, 'lecturer')
        && metaItem(<UserRound aria-hidden="true" />, 'Giảng viên', sample.lecturerName),
      isFieldVisible(config, 'semester')
        && metaItem(
          <CalendarDays aria-hidden="true" />,
          'Học kỳ',
          `${sample.semesterName} (${sample.academicYearName})`,
        ),
      isFieldVisible(config, 'credits')
        && metaItem(<ClipboardList aria-hidden="true" />, 'Số tín chỉ', String(sample.credits)),
      isFieldVisible(config, 'faculty')
        && metaItem(<ClipboardList aria-hidden="true" />, 'Khoa', sample.facultyName),
      isFieldVisible(config, 'department')
        && metaItem(<ClipboardList aria-hidden="true" />, 'Bộ môn', sample.departmentName),
      isFieldVisible(config, 'questionCount')
        && metaItem(
          <ClipboardList aria-hidden="true" />,
          'Số câu hỏi',
          String(questionCount),
        ),
    ].filter(Boolean);

    return (
      <div
        className="public-survey public-survey--preview"
        style={themeStyleOf(config)}
        onClick={() => onSelect?.(null)}
      >
        <div className="public-intro">
          {hero}

          <section className="public-intro-card">
            {logo}

            <header className="public-intro-head">
              {region('title', <h1 style={titleStyleOf(config)}>{editableText('title', title, surveyName)}</h1>)}
              {isFieldVisible(config, 'templateName') && (
                <p className="public-intro-template">{templateName}</p>
              )}
              {isFieldVisible(config, 'course') && (
                <p>
                  {sample.courseCode} – {sample.courseName}
                </p>
              )}
            </header>

            {metaItems.length > 0 && <dl className="public-intro-meta">{metaItems}</dl>}

            {isFieldVisible(config, 'schedule') && (
              <dl className="public-intro-meta public-intro-meta--full">
                {metaItem(<Clock aria-hidden="true" />, 'Thời gian làm bài', sample.schedule)}
              </dl>
            )}

            {!compact && (
              <>
                {/* MỘT dải lưu ý; dòng đầu và nội dung chọn riêng để định dạng riêng. */}
                <div className="public-intro-notice">
                  <div>
                    {region('noticeHeading', (
                      <strong style={textStyleOf(config.noticeHeadingStyle)}>
                        {editableText(
                          'introHeading',
                          textOr(config.introHeading, defaultNoticeHeading),
                          defaultNoticeHeading,
                        )}
                      </strong>
                    ))}
                    {region('noticeText', (
                      <p style={textStyleOf(config.noticeTextStyle)}>
                        {editableText('intro', textOr(config.intro, defaultIntro), defaultIntro)}
                      </p>
                    ))}
                  </div>
                </div>
              </>
            )}

            <button type="button" className="public-intro-start" disabled>
              Bắt đầu làm bài
            </button>
          </section>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------- Bài làm

  if (screen === 'quiz') {
    return (
      <div className="public-survey public-survey--preview public-survey--quiz" style={themeStyleOf(config)}>
        <div className="public-quiz">
          {hero}

          <section className="public-quiz-card">
            {logo}
            {isFieldVisible(config, 'templateName') && (
              <span className="public-quiz-badge">
                <GraduationCap aria-hidden="true" />
                {templateName}
              </span>
            )}
            <h1 style={titleStyleOf(config)}>{title}</h1>

            <dl className="public-quiz-meta">
              {(isFieldVisible(config, 'course') || isFieldVisible(config, 'section')) && (
                <div className="public-quiz-meta-item">
                  <BookOpen aria-hidden="true" />
                  <div>
                    {isFieldVisible(config, 'course') && (
                      <dt>
                        {sample.courseCode} – {sample.courseName}
                      </dt>
                    )}
                    {isFieldVisible(config, 'section') && (
                      <dd>Lớp học phần: {sample.sectionName}</dd>
                    )}
                  </div>
                </div>
              )}
              {isFieldVisible(config, 'lecturer') && (
                <div className="public-quiz-meta-item">
                  <UserRound aria-hidden="true" />
                  <div>
                    <dt>Giảng viên</dt>
                    <dd>{sample.lecturerName}</dd>
                  </div>
                </div>
              )}
              {isFieldVisible(config, 'schedule') && (
                <div className="public-quiz-meta-item">
                  <Clock aria-hidden="true" />
                  <div>
                    <dt>Phiếu mở</dt>
                    <dd>{sample.schedule}</dd>
                  </div>
                </div>
              )}
            </dl>

            {isFieldVisible(config, 'quizNotice') && (
              <div className="public-intro-notice">
                <div>
                  <strong>Lưu ý trước khi làm bài</strong>
                  <p>
                    {textOr(
                      config.intro,
                      'Vui lòng đọc kỹ từng câu hỏi và trả lời dựa trên trải nghiệm thực tế của bạn.'
                        + ' Ý kiến của bạn sẽ được sử dụng để cải thiện chất lượng giảng dạy.',
                    )}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Mục và câu hỏi THẬT của bộ đã chọn, đánh số liền mạch như phiếu sinh viên. */}
          {sections.map((section) => (
            <section className="public-quiz-section" key={section.sectionName}>
              <h2 className="public-quiz-section-title">{section.sectionName}</h2>
              <ol className="public-quiz-list">
                {section.questions.map((question) => {
                  order += 1;
                  const questionOrder = order;
                  return (
                    <li className="public-quiz-question" key={`${section.sectionName}-${questionOrder}`}>
                      <div className="public-quiz-question-head">
                        <span className="public-quiz-number" aria-hidden="true">
                          {questionOrder}
                        </span>
                        <p>{question.questionText}</p>
                      </div>
                      {question.options.length === 0 ? (
                        <div className="public-quiz-text">
                          <textarea rows={3} readOnly placeholder="Nhập câu trả lời của bạn..." />
                        </div>
                      ) : (
                        <div className="public-quiz-options">
                          {question.options.map((option) => (
                            <label className="public-quiz-option" key={option.value}>
                              <input type="radio" name={`preview-${questionOrder}`} readOnly />
                              <span className="public-quiz-option-text">
                                <span className="public-quiz-option-value">{option.value}.</span>
                                <span className="public-quiz-option-label">{option.displayText}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}

          {isFieldVisible(config, 'commentBox') && (
            <section className="public-quiz-card public-quiz-comments">
              <span className="public-quiz-badge">
                <MessageSquare aria-hidden="true" />
                Ý kiến khác
              </span>
              <h2>Ý kiến khác của bạn (nếu có)</h2>
              <textarea rows={2} readOnly placeholder="Ý kiến của sinh viên..." />
            </section>
          )}

          {isFieldVisible(config, 'questionReview') && (
            <section className="public-quiz-card public-quiz-review">
              <div className="public-quiz-progress">
                <span className="public-quiz-progress-label">
                  Câu hỏi {answeredSample} / {questionCount}
                </span>
                <div className="public-quiz-progress-bar">
                  <span style={{ width: `${progressSample}%` }} />
                </div>
                <span className="public-quiz-progress-percent">{progressSample}%</span>
              </div>

              <div className="public-question-review-heading">
                <ClipboardList aria-hidden="true" />
                <div>
                  <h2>Danh sách câu hỏi</h2>
                  <p>Bấm vào số câu để xem lại hoặc hoàn thành câu còn thiếu.</p>
                </div>
              </div>

              <div className="public-question-review-grid">
                {Array.from({ length: questionCount }, (_, index) => (
                  <span
                    className={`public-question-review-item${
                      index < answeredSample ? ' is-answered' : ''
                    }`}
                    key={index}
                  >
                    <span>{index + 1}</span>
                    <span aria-hidden="true">{index < answeredSample ? '✓' : '–'}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          <button type="button" className="public-intro-start public-quiz-submit" disabled>
            <Send aria-hidden="true" />
            {textOr(config.submitLabel, 'Nộp bài khảo sát')}
          </button>
        </div>
      </div>
    );
  }
};
