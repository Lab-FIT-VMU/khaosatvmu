import React, { useMemo, type ReactNode } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import '../styles/formula.css';

/*
  Bộ dựng công thức cho phần chú thích, chạy trên KaTeX.

  Trước đây phân số và dấu căn được ghép tay bằng CSS (hai tầng chữ kèm một gạch
  ngang, dấu √ với border-top). Cách đó đủ dùng cho công thức một tầng, nhưng tới
  phân số lồng trong mẫu của phân số khác — σ toàn trường ÷ √n nằm dưới gạch của
  Z-Score — thì các tầng không còn canh đúng đường giữa, và dấu căn không cao theo
  phần nằm trong căn.

  KaTeX dựng đúng như sách in: cận của Σ nằm trên dưới dấu tổng, dấu căn có móc và
  vươn trùm cả phân số, mọi tầng canh theo đường trục của biểu thức.

  LƯU Ý về tiếng Việt: bộ phông của KaTeX không có chữ có dấu, nên \text{toàn trường}
  sẽ rơi về phông hệ thống. Vì vậy phải bật strict: 'ignore' (không thì KaTeX kêu lỗi
  ký tự Unicode) và khai phông dự phòng cho .katex .text trong formula.css.
*/

const renderTex = (tex: string, displayMode: boolean): string =>
  katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    // Ký tự tiếng Việt trong \text{} không nằm trong phông KaTeX; 'ignore' để KaTeX
    // cứ xuất ra và nhường việc chọn phông cho trình duyệt.
    strict: 'ignore',
    output: 'html',
  });

/** Công thức nằm lẫn trong dòng chữ, ví dụ một ký hiệu trong bảng chú giải. */
export const TeX: React.FC<{ tex: string }> = ({ tex }) => {
  const html = useMemo(() => renderTex(tex, false), [tex]);
  return <span className="math-tex" dangerouslySetInnerHTML={{ __html: html }} />;
};

/** Một mục công thức: tiêu đề nhỏ, công thức đứng riêng giữa dòng. */
export const Formula: React.FC<{ title?: string; tex: string }> = ({ title, tex }) => {
  const html = useMemo(() => renderTex(tex, true), [tex]);
  return (
    <div className="formula">
      {title && <p className="formula__title">{title}</p>}
      <div className="formula__body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
};

/** Bảng ký hiệu: câu dẫn "Trong đó:" rồi mỗi dòng một ký hiệu kèm nghĩa của nó. */
export const FormulaDefs: React.FC<{
  items: Array<{ tex: string; meaning: ReactNode }>;
}> = ({ items }) => (
  <div className="formula-defs">
    <p className="formula-defs__lead">Trong đó:</p>
    <ul className="formula-defs__list">
      {items.map((item) => (
        <li key={item.tex}>
          <TeX tex={item.tex} />
          <span className="formula-defs__meaning">: {item.meaning}</span>
        </li>
      ))}
    </ul>
  </div>
);

/** Bảng nhỏ hai cột, dùng cho bảng phân loại theo độ lệch chuẩn. */
export const FormulaTable: React.FC<{
  headers: [string, string];
  rows: Array<[ReactNode, ReactNode]>;
}> = ({ headers, rows }) => (
  <table className="formula-table">
    <thead>
      <tr>
        <th scope="col">{headers[0]}</th>
        <th scope="col">{headers[1]}</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row, index) => (
        <tr key={index}>
          <td style={{ textAlign: 'left' }}>{row[0]}</td>
          <td>{row[1]}</td>
        </tr>
      ))}
    </tbody>
  </table>
);
