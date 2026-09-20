import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CircleAlert,
  ClipboardList,
  Clock,
  GraduationCap,
  MessageSquare,
  LoaderCircle,
  Send,
  UserRound,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { ApiError } from '../services/apiClient';
import { publicSurveyApi, surveyErrorMessage } from '../services/surveyApi';
import { maximumTextAnswerLength } from '../types';
import type { AnswerScale, PublicSurvey, SurveyFormConfig } from '../types';
import {
  coverStyleOf,
  customText,
  isFieldVisible,
  textStyleOf,
  textOr,
  themeStyleOf,
  titleStyleOf,
} from '../utils/surveyForm';
import '../styles/public-survey.css';

const maximumCommentLength = 1000;

/** Nội dung dải lưu ý khi đợt không đặt chữ riêng. */
const defaultIntroText = 'Vui lòng đọc kỹ từng câu hỏi và trả lời dựa trên trải nghiệm thực tế của'
  + ' bạn. Phiếu này không ghi tên, mã sinh viên hay bất kỳ thông tin nào nhận ra bạn: giảng viên'
  + ' chỉ nhận được kết quả tổng hợp của cả lớp, không xem được từng phiếu riêng lẻ.';

/**
 * Hình thức phiếu kèm trong lời báo lỗi của màn chặn. Server gửi nó cùng `errorCode`
 * khi link có thật nhưng chưa mở, đã hết hạn hoặc lớp đã đủ phiếu — nhờ vậy màn chặn
 * vẫn đúng màu và đúng câu chữ của đợt dù chưa tải được phiếu.
 */
function blockedFormOf(error: unknown): SurveyFormConfig | null {
  if (!(error instanceof ApiError)) return null;

  const config = error.body.formConfig;
  return config && typeof config === 'object' ? (config as SurveyFormConfig) : null;
}

/**
 * Câu chữ của màn chặn do đợt đặt. Mỗi mã lỗi lấy đúng một trường; đợt không đặt thì
 * trả null để dùng câu mặc định theo mã lỗi.
 */
function blockedMessage(
  errorCode: string | null,
  config: SurveyFormConfig | null,
): string | null {
  if (!config) return null;

  switch (errorCode) {
    case 'SURVEY_LINK_NOT_STARTED':
      return customText(config.notOpenMessage);
    case 'SURVEY_LINK_EXPIRED':
      return customText(config.closedMessage);
    case 'SURVEY_CLASS_FULL':
      return customText(config.classFullMessage);
    default:
      return null;
  }
}

/**
 * Bài làm dở và vé bắt đầu nằm CHUNG một ô localStorage. Nếu tách hai chỗ thì có
 * lúc bài dở còn mà vé mất, sinh viên mở lại thấy đáp án cũ nguyên vẹn nhưng
 * đồng hồ về không, nộp phát là dính lọc dù đã làm nghiêm túc. Để chung thì hai
 * thứ sống chết cùng nhau.
 */
interface SurveyDraft {
  answers: Record<number, string>;
  comments: string;
  startTicket: string;
}

const draftKeyOf = (linkToken: string) => `survey_draft_${linkToken}`;

function readDraft(linkToken: string): SurveyDraft | null {
  try {
    const raw = localStorage.getItem(draftKeyOf(linkToken));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SurveyDraft>;
    // Bản nháp cũ từ trước khi có vé thì bỏ, vì không chứng minh được thời gian.
    if (typeof parsed.startTicket !== 'string' || parsed.startTicket.length === 0) return null;
    return {
      answers: parsed.answers ?? {},
      comments: parsed.comments ?? '',
      startTicket: parsed.startTicket,
    };
  } catch {
    // localStorage bị ngắt hoặc nội dung hỏng: coi như chưa có gì.
    return null;
  }
}

function clearDraft(linkToken: string): void {
  try {
    localStorage.removeItem(draftKeyOf(linkToken));
  } catch {
    // Bỏ qua.
  }
}

type PublicSurveyQuestion = PublicSurvey['questions'][number];

/** Một câu hỏi kèm thang trả lời của nó và số thứ tự trong bộ đề. */
interface QuestionRow {
  question: PublicSurveyQuestion;
  order: number;
  scale: AnswerScale;
}

/** Một mục kèm toàn bộ câu hỏi của nó; cả mục nằm chung một thẻ trên phiếu. */
interface SectionGroup {
  sectionId: number;
  sectionName: string;
  /** Số La Mã của mục: I, II, III… giống mẫu phiếu giấy của trường. */
  numeral: string;
  rows: QuestionRow[];
}

const romanNumerals: [number, string][] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** Đủ dùng cho số mục tối đa của một bộ; không cần công thức tổng quát. */
function toRoman(value: number): string {
  let remaining = value;
  let result = '';

  for (const [amount, symbol] of romanNumerals) {
    while (remaining >= amount) {
      result += symbol;
      remaining -= amount;
    }
  }

  return result;
}

/**
 * Gom câu theo mục: mỗi mục là một thẻ, bên trong là các câu của mục.
 *
 * Mỗi câu vẫn đứng riêng một dòng chứ không gộp thành bảng ma trận — bộ đề trộn
 * nhiều loại thang thì bảng vỡ thành mấy khối rời rạc mỗi khối một bộ cột.
 *
 * Số thứ tự chạy suốt cả phiếu và đánh trên MỌI câu, kể cả câu bẫy: số ở đây phải
 * khớp thanh tiến độ và lưới điều hướng cuối phiếu. Bỏ số của câu bẫy là chỉ thẳng
 * vào nó cho sinh viên thấy. Các màn quản trị thì ngược lại — bên đó bẫy không số.
 */
function buildSectionGroups(survey: PublicSurvey): SectionGroup[] {
  const scaleById = new Map(survey.answerScales.map((scale) => [scale.answerScaleId, scale]));
  const groups: SectionGroup[] = [];
  const groupBySectionId = new Map<number, SectionGroup>();

  survey.sections.forEach((section, index) => {
    const group: SectionGroup = {
      sectionId: section.sectionId,
      sectionName: section.sectionName,
      numeral: toRoman(index + 1),
      rows: [],
    };
    groups.push(group);
    groupBySectionId.set(section.sectionId, group);
  });

  survey.questions.forEach((question, index) => {
    const scale = scaleById.get(question.answerScaleId);
    const group = groupBySectionId.get(question.sectionId);
    if (!scale || !group) return;

    group.rows.push({ question, order: index + 1, scale });
  });

  // Mục rỗng không hiện: backend không cho lưu mục không có câu nào, nhưng dữ
  // liệu cũ hoặc câu bị bỏ thang có thể để lại mục trống.
  return groups.filter((group) => group.rows.length > 0);
}

interface PublicSurveyPageProps {
  linkToken: string;
}

function messageFrom(error: unknown): string {
  return error instanceof ApiError ? surveyErrorMessage(error.errorCode) : surveyErrorMessage(null);
}

function formatRange(startTime: string, endTime: string): string {
  const formatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  return `${formatter.format(new Date(startTime))} → ${formatter.format(new Date(endTime))}`;
}

export const PublicSurveyPage: React.FC<PublicSurveyPageProps> = ({ linkToken }) => {
  const [survey, setSurvey] = useState<PublicSurvey | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Mã lỗi và hình thức phiếu của lần tải hỏng, để vẽ màn chặn theo đúng đợt. */
  const [blockedCode, setBlockedCode] = useState<string | null>(null);
  const [blockedForm, setBlockedForm] = useState<SurveyFormConfig | null>(null);

  // Giá trị thô theo "SurveyResponseAnswers"."AnswerValue": số mức đã chọn dạng
  // chuỗi với câu chọn mức, nội dung đã gõ với câu tự nhập.
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [comments, setComments] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [invalidQuestionId, setInvalidQuestionId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  /** Ảnh bìa là tuỳ chọn: chưa đặt tệp vào thì gỡ luôn dải ảnh thay vì để ô vỡ. */
  const [heroVisible, setHeroVisible] = useState(true);

  /**
   * Vé bắt đầu làm bài. Chưa có vé nghĩa là đang ở màn mở đầu; có vé thì vào màn
   * làm bài. Vé chính là mốc tính thời gian nên phải xin từ server, không tự sinh.
   */
  const [startTicket, setStartTicket] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const loadedSurvey = await publicSurveyApi.survey(linkToken);
        setSurvey(loadedSurvey);
        setLoadError(null);
        setBlockedCode(null);
        setBlockedForm(null);

        // Có bài làm dở kèm vé thì vào thẳng màn làm bài, khỏi bắt bấm lại.
        const draft = readDraft(linkToken);
        if (draft) {
          setAnswers(draft.answers);
          setComments(draft.comments);
          setStartTicket(draft.startTicket);
        }
      } catch (error) {
        setLoadError(messageFrom(error));
        setBlockedCode(error instanceof ApiError ? error.errorCode : null);
        setBlockedForm(blockedFormOf(error));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [linkToken]);

  // Tự động lưu tiến độ. Chỉ lưu khi đã có vé, vì bài dở mà thiếu vé thì lúc mở
  // lại cũng không dùng được.
  useEffect(() => {
    if (!survey || submitted || !startTicket) return;
    try {
      localStorage.setItem(
        draftKeyOf(linkToken),
        JSON.stringify({ answers, comments, startTicket } satisfies SurveyDraft)
      );
    } catch {
      // Bỏ qua lỗi truy cập localStorage.
    }
  }, [answers, comments, linkToken, survey, submitted, startTicket]);

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const { startTicket: ticket } = await publicSurveyApi.start(linkToken);
      setStartTicket(ticket);
    } catch (error) {
      setStartError(messageFrom(error));
    } finally {
      setStarting(false);
    }
  };

  const sectionGroups = useMemo(() => (survey ? buildSectionGroups(survey) : []), [survey]);

  // Hình thức phiếu do quản trị đặt lúc tạo đợt. Không có thì mọi thứ về mẫu mặc định.
  const form = survey?.formConfig ?? null;
  const theme = useMemo(() => themeStyleOf(form), [form]);

  // Danh sách phẳng cho thanh tiến độ, lưới điều hướng và việc tìm câu chưa trả lời.
  const questionRows = useMemo(
    () => sectionGroups.flatMap((group) => group.rows),
    [sectionGroups]
  );

  const answeredCount = useMemo(
    () =>
      survey
        ? survey.questions.filter((q) => (answers[q.questionId] ?? '').trim().length > 0).length
        : 0,
    [survey, answers]
  );
  const totalQuestions = survey?.questions.length ?? 0;
  const progress = totalQuestions === 0 ? 0 : Math.round((answeredCount / totalQuestions) * 100);

  const focusQuestion = (questionId: number) => {
    requestAnimationFrame(() => {
      const questionElement = document.querySelector<HTMLElement>(
        `[data-question-id="${questionId}"]`
      );
      questionElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      questionElement?.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
    });
  };

  /** Bấm nút Nộp: kiểm đủ câu rồi mới mở hộp thoại xác nhận. */
  const handleSubmitRequest = (event: React.FormEvent) => {
    event.preventDefault();
    if (!survey || submitting) return;

    if (answeredCount < totalQuestions) {
      setSubmitError('Vui lòng trả lời đầy đủ tất cả câu hỏi trước khi nộp.');
      const firstUnanswered = questionRows.find(
        ({ question }) => !(answers[question.questionId] ?? '').trim()
      );
      if (firstUnanswered) {
        const questionId = firstUnanswered.question.questionId;
        setInvalidQuestionId(questionId);
        focusQuestion(questionId);
      }
      return;
    }

    setSubmitError(null);
    setConfirmingSubmit(true);
  };

  const handleSubmitConfirmed = async () => {
    if (!survey || submitting) return;
    setConfirmingSubmit(false);
    setSubmitting(true);
    try {
      await publicSurveyApi.submit(linkToken, {
        answers: survey.questions.map((question) => ({
          questionId: question.questionId,
          answerValue: (answers[question.questionId] ?? '').trim(),
        })),
        additionalComments: comments.trim() ? comments.trim() : null,
        startTicket,
      });
      setSubmitted(true);
      setSubmitError(null);
      // Nộp xong xoá cả bài dở lẫn vé.
      clearDraft(linkToken);
    } catch (error) {
      setSubmitError(messageFrom(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="public-survey-shell">
      <main className="public-survey">
        <div className="public-survey-state" role="status">
          <LoaderCircle className="auth-spin" aria-hidden="true" />
          <span>Đang tải phiếu khảo sát...</span>
        </div>
      </main>
      </div>
    );
  }

  if (loadError || !survey) {
    // Màn chặn: dùng màu và câu chữ của đợt nếu server gửi kèm cấu hình, không thì
    // rơi về câu mặc định theo mã lỗi như trước.
    return (
      <div className="public-survey-shell">
      <main className="public-survey" style={themeStyleOf(blockedForm)}>
        <div className="public-survey-state public-survey-state--error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>
            {blockedMessage(blockedCode, blockedForm)
              ?? loadError
              ?? 'Không tìm thấy phiếu khảo sát.'}
          </span>
        </div>
      </main>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="public-survey-shell">
      <main className="public-survey public-survey--done" style={theme}>
        <div className="public-quiz">
          {heroVisible && (
            <div className="public-intro-hero">
              <img
                src={form?.coverImageUrl || '/headerimg/green.png'}
                style={coverStyleOf(form)}
                alt=""
                aria-hidden="true"
                onError={() => setHeroVisible(false)}
              />
            </div>
          )}

          <section className="public-done" aria-live="polite">
            {form?.logoUrl && (
              <div className="public-survey-logo">
                <img src={form.logoUrl} alt="" />
              </div>
            )}
            {/* Dấu tích kèm mấy tia toả: vẽ luôn bằng SVG cho gọn, không thêm thư viện. */}
            <svg
              className="public-done-mark"
              viewBox="0 0 96 96"
              role="img"
              aria-label="Đã gửi thành công"
            >
              <g stroke="#1f7a45" strokeWidth="4" strokeLinecap="round" opacity="0.75">
                <line x1="48" y1="4" x2="48" y2="14" />
                <line x1="18" y1="14" x2="25" y2="22" />
                <line x1="78" y1="14" x2="71" y2="22" />
                <line x1="6" y1="44" x2="16" y2="44" />
                <line x1="90" y1="44" x2="80" y2="44" />
              </g>
              <circle cx="48" cy="52" r="22" fill="#1f7a45" />
              <path
                d="M38 52.5 45 59.5 58.5 45.5"
                fill="none"
                stroke="#ffffff"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            <h1>{textOr(form?.thankYouTitle, 'Đã gửi phiếu khảo sát thành công!')}</h1>
            <p>
              {textOr(
                form?.thankYouMessage,
                'Cảm ơn bạn đã tham gia khảo sát. Ý kiến của bạn sẽ được tổng hợp và sử dụng để'
                  + ' cải thiện chất lượng giảng dạy.',
              )}
            </p>
          </section>

          <p className="public-intro-footnote">Phiên bản thử nghiệm</p>
        </div>
      </main>
      </div>
    );
  }

  // Màn mở đầu. Cú bấm "Bắt đầu làm bài" là mốc tính thời gian, nên không vào
  // thẳng danh sách câu hỏi được nữa.
  // Cố ý KHÔNG hiện thời gian tối thiểu dưới bất kỳ dạng nào, kể cả ước lượng:
  // ghi ra là chỉ luôn cho người làm ẩu biết cần ngồi chờ bao lâu cho đủ.
  if (!startTicket) {
    return (
      <div className="public-survey-shell">
      <main className="public-survey public-survey--intro" style={theme}>
        <div className="public-intro">
          {/*
            Ảnh bìa tuỳ chọn: đặt tệp tại `src/Frontend/public/headerimg/green.png`.
            Không có tệp thì onError gỡ luôn cả dải, phiếu vẫn hiển thị bình thường
            chứ không để lại một ô ảnh vỡ.
          */}
          {heroVisible && (
            <div className="public-intro-hero">
              <img
                src={form?.coverImageUrl || '/headerimg/green.png'}
                style={coverStyleOf(form)}
                alt=""
                aria-hidden="true"
                onError={() => setHeroVisible(false)}
              />
            </div>
          )}

          <section className="public-intro-card">
            {/* Logo của đợt, nếu quản trị có đặt lúc tạo. */}
            {form?.logoUrl && (
              <div className="public-survey-logo">
                <img src={form.logoUrl} alt="" />
              </div>
            )}
            <header className="public-intro-head">
              {/* Tiêu đề là tên ĐỢT khảo sát; tên bộ câu hỏi là chuyện nội bộ. */}
              <h1 style={titleStyleOf(form)}>
                {textOr(form?.title, survey.surveyName || survey.templateName)}
              </h1>
              {isFieldVisible(form, 'templateName') && (
                <p className="public-intro-template">{survey.templateName}</p>
              )}
              {isFieldVisible(form, 'course') && (
                <p>
                  {survey.courseCode} – {survey.courseName}
                </p>
              )}
            </header>

            {/* Từng ô thông tin bật/tắt được trong màn soạn phiếu của quản trị. */}
            <dl className="public-intro-meta">
              {isFieldVisible(form, 'section') && (
                <div className="public-intro-meta-item">
                  <ClipboardList aria-hidden="true" />
                  <div>
                    <dt>Lớp học phần</dt>
                    <dd>{survey.sectionName}</dd>
                  </div>
                </div>
              )}
              {isFieldVisible(form, 'lecturer') && (
                <div className="public-intro-meta-item">
                  <UserRound aria-hidden="true" />
                  <div>
                    <dt>Giảng viên</dt>
                    <dd>{survey.lecturerName || 'Chưa phân công'}</dd>
                  </div>
                </div>
              )}
              {isFieldVisible(form, 'semester') && (
                <div className="public-intro-meta-item">
                  <CalendarDays aria-hidden="true" />
                  <div>
                    <dt>Học kỳ</dt>
                    <dd>
                      {survey.semesterName} ({survey.academicYearName})
                    </dd>
                  </div>
                </div>
              )}
              {isFieldVisible(form, 'credits') && survey.credits > 0 && (
                <div className="public-intro-meta-item">
                  <ClipboardList aria-hidden="true" />
                  <div>
                    <dt>Số tín chỉ</dt>
                    <dd>{survey.credits}</dd>
                  </div>
                </div>
              )}
              {isFieldVisible(form, 'faculty') && survey.facultyName && (
                <div className="public-intro-meta-item">
                  <ClipboardList aria-hidden="true" />
                  <div>
                    <dt>Khoa</dt>
                    <dd>{survey.facultyName}</dd>
                  </div>
                </div>
              )}
              {isFieldVisible(form, 'department') && survey.departmentName && (
                <div className="public-intro-meta-item">
                  <ClipboardList aria-hidden="true" />
                  <div>
                    <dt>Bộ môn</dt>
                    <dd>{survey.departmentName}</dd>
                  </div>
                </div>
              )}
              {isFieldVisible(form, 'questionCount') && (
                <div className="public-intro-meta-item">
                  <ClipboardList aria-hidden="true" />
                  <div>
                    <dt>Số câu hỏi</dt>
                    <dd>{totalQuestions}</dd>
                  </div>
                </div>
              )}
            </dl>

            {/* Khoảng thời gian dài hơn hẳn bốn ô trên nên tách xuống một hàng riêng. */}
            {isFieldVisible(form, 'schedule') && (
              <dl className="public-intro-meta public-intro-meta--full">
                <div className="public-intro-meta-item">
                  <Clock aria-hidden="true" />
                  <div>
                    <dt>Thời gian làm bài</dt>
                    <dd>{formatRange(survey.startTime, survey.endTime)}</dd>
                  </div>
                </div>
              </dl>
            )}

            {/* Một dải lưu ý duy nhất; dòng đầu và nội dung có định dạng riêng. */}
            <div className="public-intro-notice">
              <div>
                <strong style={textStyleOf(form?.noticeHeadingStyle)}>
                  {textOr(form?.introHeading, 'Lưu ý')}
                </strong>
                <p style={textStyleOf(form?.noticeTextStyle)}>
                  {textOr(form?.intro, defaultIntroText)}
                </p>
              </div>
            </div>

            {!survey.isOpen && (
              <div className="public-survey-alert" role="alert">
                <CircleAlert aria-hidden="true" />
                <span>
                  {textOr(
                    form?.closedMessage,
                    'Phiếu khảo sát chưa mở hoặc đã hết hạn nên không thể làm bài.',
                  )}
                </span>
              </div>
            )}

            {startError && (
              <div className="public-survey-alert" role="alert">
                <CircleAlert aria-hidden="true" />
                <span>{startError}</span>
              </div>
            )}

            <button
              type="button"
              className="public-intro-start"
              disabled={!survey.isOpen || starting}
              onClick={() => void handleStart()}
            >
              {starting ? (
                <>
                  <LoaderCircle className="auth-spin" aria-hidden="true" />
                  Đang mở phiếu...
                </>
              ) : (
                <>
                  Bắt đầu làm bài
                  <ArrowRight aria-hidden="true" />
                </>
              )}
            </button>
          </section>

          <p className="public-intro-footnote">Phiên bản thử nghiệm</p>
        </div>
      </main>
      </div>
    );
  }

  return (
    <div className="public-survey-shell">
    <main className="public-survey public-survey--quiz" style={theme}>
      <div className="public-quiz">
        {heroVisible && (
          <div className="public-intro-hero">
            <img
              src={form?.coverImageUrl || '/headerimg/green.png'}
              style={coverStyleOf(form)}
              alt=""
              aria-hidden="true"
              onError={() => setHeroVisible(false)}
            />
          </div>
        )}

        <section className="public-quiz-card">
          {/* Logo của đợt đi theo suốt phiếu, không chỉ ở màn mở đầu. */}
          {form?.logoUrl && (
            <div className="public-survey-logo">
              <img src={form.logoUrl} alt="" />
            </div>
          )}
          {isFieldVisible(form, 'templateName') && (
            <span className="public-quiz-badge">
              <GraduationCap aria-hidden="true" />
              {survey.templateName}
            </span>
          )}
          <h1 style={titleStyleOf(form)}>
            {textOr(form?.title, survey.surveyName || survey.templateName)}
          </h1>

          <dl className="public-quiz-meta">
            {(isFieldVisible(form, 'course') || isFieldVisible(form, 'section')) && (
              <div className="public-quiz-meta-item">
                <BookOpen aria-hidden="true" />
                <div>
                  {isFieldVisible(form, 'course') && (
                    <dt>
                      {survey.courseCode} – {survey.courseName}
                    </dt>
                  )}
                  {isFieldVisible(form, 'section') && <dd>Lớp học phần: {survey.sectionName}</dd>}
                </div>
              </div>
            )}
            {isFieldVisible(form, 'lecturer') && (
              <div className="public-quiz-meta-item">
                <UserRound aria-hidden="true" />
                <div>
                  <dt>Giảng viên</dt>
                  <dd>{survey.lecturerName || 'Chưa phân công'}</dd>
                </div>
              </div>
            )}
            {(isFieldVisible(form, 'semester') || isFieldVisible(form, 'questionCount')) && (
              <div className="public-quiz-meta-item">
                <CalendarDays aria-hidden="true" />
                <div>
                  {isFieldVisible(form, 'semester') && (
                    <dt>
                      {survey.semesterName} ({survey.academicYearName})
                    </dt>
                  )}
                  {isFieldVisible(form, 'questionCount') && <dd>Số câu hỏi: {totalQuestions}</dd>}
                </div>
              </div>
            )}
            {((isFieldVisible(form, 'faculty') && survey.facultyName)
              || (isFieldVisible(form, 'department') && survey.departmentName)) && (
              <div className="public-quiz-meta-item">
                <BookOpen aria-hidden="true" />
                <div>
                  {isFieldVisible(form, 'faculty') && survey.facultyName && (
                    <dt>{survey.facultyName}</dt>
                  )}
                  {isFieldVisible(form, 'department') && survey.departmentName && (
                    <dd>{survey.departmentName}</dd>
                  )}
                </div>
              </div>
            )}
            {isFieldVisible(form, 'schedule') && (
              <div className="public-quiz-meta-item">
                <Clock aria-hidden="true" />
                <div>
                  <dt>Phiếu mở</dt>
                  <dd>{formatRange(survey.startTime, survey.endTime)}</dd>
                </div>
              </div>
            )}
          </dl>

          {isFieldVisible(form, 'quizNotice') && (
            <div className="public-intro-notice">
              <div>
                <strong>Lưu ý trước khi làm bài</strong>
                <p>
                  {textOr(form?.intro, defaultIntroText)}
                </p>
              </div>
            </div>
          )}

          {!survey.isOpen && (
            <div className="public-survey-alert" role="alert">
              <CircleAlert aria-hidden="true" />
              <span>
                {textOr(
                  form?.closedMessage,
                  'Phiếu khảo sát chưa mở hoặc đã hết hạn nên không thể nộp bài.',
                )}
              </span>
            </div>
          )}
        </section>

        <form onSubmit={handleSubmitRequest}>
          {/*
            Cả một mục nằm chung một thẻ, tiêu đề mục là dải trên cùng của thẻ đó.
            Bên trong, mỗi câu vẫn là một dòng riêng chứ không gộp thành bảng ma
            trận: bảng ma trận chỉ gọn khi cả bộ đề dùng đúng một thang, bộ trộn
            thang chọn mức với Có/Không và câu tự nhập thì nó vỡ thành mấy bảng rời
            rạc, mỗi bảng một bộ cột khác nhau.
          */}
          {sectionGroups.map((group) => (
            <section className="public-quiz-section" key={group.sectionId}>
              <h2 className="public-quiz-section-title">
                {group.numeral}. {group.sectionName}
              </h2>

              <ol className="public-quiz-list">
                {group.rows.map(({ question, order, scale }) => {
                  const value = answers[question.questionId] ?? '';

                  return (
                    <li
                      className={`public-quiz-question${invalidQuestionId === question.questionId ? ' is-invalid' : ''}`}
                      key={question.questionId}
                      data-question-id={question.questionId}
                    >
                  <div className="public-quiz-question-head">
                    <span className="public-quiz-number" aria-hidden="true">
                      {order}
                    </span>
                    <p>{question.questionText}</p>
                  </div>

                  {scale.scaleKind === 'Text' ? (
                    <div className="public-quiz-text">
                      <textarea
                        id={`question-${question.questionId}`}
                        rows={3}
                        maxLength={maximumTextAnswerLength}
                        placeholder="Nhập câu trả lời của bạn..."
                        aria-label={question.questionText}
                        aria-invalid={invalidQuestionId === question.questionId}
                        value={value}
                        disabled={!survey.isOpen || submitting}
                        onChange={(event) => {
                          setAnswers((prev) => ({
                            ...prev,
                            [question.questionId]: event.target.value,
                          }));
                          setSubmitError(null);
                          setInvalidQuestionId(null);
                        }}
                      />
                      <span className="public-survey-counter">
                        {value.length}/{maximumTextAnswerLength}
                      </span>
                    </div>
                  ) : (
                    <div
                      className="public-quiz-options"
                      role="radiogroup"
                      aria-label={question.questionText}
                      aria-invalid={invalidQuestionId === question.questionId}
                    >
                      {scale.options.map((option) => {
                        const selected = value === String(option.value);
                        return (
                          <label
                            className={selected ? 'public-quiz-option is-selected' : 'public-quiz-option'}
                            key={option.answerScaleOptionId}
                          >
                            <input
                              type="radio"
                              name={`question-${question.questionId}`}
                              value={option.value}
                              checked={selected}
                              disabled={!survey.isOpen || submitting}
                              onChange={() => {
                                setAnswers((prev) => ({
                                  ...prev,
                                  [question.questionId]: String(option.value),
                                }));
                                setSubmitError(null);
                                setInvalidQuestionId(null);
                              }}
                            />
                            <span className="public-quiz-option-text">
                              <span className="public-quiz-option-value">{option.value}.</span>
                              <span className="public-quiz-option-label">{option.displayText}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}

          {isFieldVisible(form, 'commentBox') && (
          <section className="public-quiz-card public-quiz-comments">
            <span className="public-quiz-badge">
              <MessageSquare aria-hidden="true" />
              Ý kiến khác
            </span>
            <h2>Ý kiến khác của bạn (nếu có)</h2>
            <p className="public-quiz-comments-hint">
              Bạn có thể chia sẻ thêm ý kiến, đề xuất hoặc góp ý khác về giảng dạy, học phần
              hoặc nhà trường (không bắt buộc).
            </p>
            <textarea
              id="public-survey-comments"
              rows={5}
              maxLength={maximumCommentLength}
              placeholder="Nhập ý kiến của bạn tại đây..."
              aria-label="Ý kiến khác của bạn"
              value={comments}
              disabled={!survey.isOpen || submitting}
              onChange={(event) => setComments(event.target.value)}
            />
            <span className="public-survey-counter">
              {comments.length}/{maximumCommentLength}
            </span>
          </section>
          )}

          {isFieldVisible(form, 'questionReview') && (
          <section className="public-quiz-card public-quiz-review" aria-labelledby="question-review-title">
            <div className="public-quiz-progress">
              <span className="public-quiz-progress-label">
                Câu hỏi {answeredCount} / {totalQuestions}
              </span>
              <div
                className="public-quiz-progress-bar"
                role="progressbar"
                aria-label="Tiến độ trả lời"
                aria-valuemin={0}
                aria-valuemax={totalQuestions}
                aria-valuenow={answeredCount}
              >
                <span style={{ width: `${progress}%` }} />
              </div>
              <span className="public-quiz-progress-percent">{progress}%</span>
            </div>

            <div className="public-question-review-heading">
              <ClipboardList aria-hidden="true" />
              <div>
                <h2 id="question-review-title">Danh sách câu hỏi</h2>
                <p>Bấm vào số câu để xem lại hoặc hoàn thành câu còn thiếu.</p>
              </div>
            </div>

            <div className="public-question-review-grid">
              {questionRows.map(({ question, order }) => {
                const isAnswered = (answers[question.questionId] ?? '').trim().length > 0;
                return (
                  <button
                    type="button"
                    className={`public-question-review-item${isAnswered ? ' is-answered' : ''}`}
                    key={question.questionId}
                    aria-label={`Câu ${order}, ${isAnswered ? 'đã trả lời' : 'chưa trả lời'}`}
                    onClick={() => focusQuestion(question.questionId)}
                  >
                    <span>{order}</span>
                    <span aria-hidden="true">{isAnswered ? '✓' : '–'}</span>
                  </button>
                );
              })}
            </div>
          </section>
          )}

          {submitError && (
            <div className="public-survey-alert" role="alert">
              <CircleAlert aria-hidden="true" />
              <span>{submitError}</span>
            </div>
          )}

          {/*
            Chỉ còn đúng một nút. Cả phiếu nằm trên một trang cuộn dọc nên "Quay lại"
            và "Tiếp theo" không dẫn đi đâu cả.
          */}
          <button
            type="submit"
            className="public-intro-start public-quiz-submit"
            disabled={!survey.isOpen || submitting}
          >
            {submitting ? (
              <>
                <LoaderCircle className="auth-spin" aria-hidden="true" />
                Đang gửi...
              </>
            ) : (
              <>
                <Send aria-hidden="true" />
                {textOr(form?.submitLabel, 'Nộp bài khảo sát')}
              </>
            )}
          </button>
        </form>

        <p className="public-intro-footnote">Phiên bản thử nghiệm</p>
      </div>

      {/* Server tính thời gian từ lúc phát vé tới lúc nhận request nên hộp thoại
          này nằm trong khoảng đó, ngồi phân vân lâu cũng không sao vì chỉ chặn
          ngưỡng dưới. */}
      <Modal
        isOpen={confirmingSubmit}
        onClose={() => setConfirmingSubmit(false)}
        title="Xác nhận nộp bài"
        size="compact"
      >
        {/*
          Dùng lại vỏ Modal để giữ nguyên phím Esc, bấm ra ngoài và trả tiêu điểm
          về chỗ cũ; phần tiêu đề của vỏ được CSS ẩn đi vì bản thiết kế đặt tiêu
          đề vào giữa thân hộp.
        */}
        <div className="public-submit-confirm">
          <span className="public-submit-icon" aria-hidden="true">
            !
          </span>
          <h2>Xác nhận nộp bài</h2>
          <p>
            Bạn đã hoàn thành tất cả các câu hỏi.
            <br />
            Bạn có chắc chắn <strong>muốn nộp bài khảo sát</strong> không?
          </p>

          <dl className="public-submit-facts">
            <div>
              <dt>Môn học:</dt>
              <dd>
                {survey.courseCode} - {survey.courseName}
              </dd>
            </div>
            <div>
              <dt>Lớp học phần:</dt>
              <dd>{survey.sectionName}</dd>
            </div>
            <div>
              <dt>Giảng viên:</dt>
              <dd>{survey.lecturerName || 'Chưa phân công'}</dd>
            </div>
            <div>
              <dt>Số câu hỏi:</dt>
              <dd>{totalQuestions}</dd>
            </div>
          </dl>

          <div className="public-submit-actions">
            <button
              type="button"
              className="public-submit-cancel"
              onClick={() => setConfirmingSubmit(false)}
            >
              Hủy
            </button>
            <button
              type="button"
              className="public-submit-ok"
              onClick={() => void handleSubmitConfirmed()}
            >
              <Send aria-hidden="true" />
              {textOr(form?.submitLabel, 'Nộp bài')}
            </button>
          </div>
        </div>
      </Modal>
    </main>
    </div>
  );
};
