import React, { useState, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { Modal } from './Modal';

interface NoteModalButtonProps {
  /** Tiêu đề hộp thoại, cũng là tooltip của nút. */
  title: string;
  /** Nhãn cạnh icon; bỏ trống thì nút chỉ còn dấu chấm than. */
  label?: string;
  children: ReactNode;
}

/**
 * Nút mở phần chú thích của một trang hoặc một tab. Các bảng phân tích có công
 * thức và bảng quy ước dài; để nguyên dưới chân trang thì phải cuộn hết mới đọc
 * được, mà lần nào cũng chiếm chỗ dù đã thuộc lòng.
 */
export const NoteModalButton: React.FC<NoteModalButtonProps> = ({ title, label = 'Chú thích', children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="note-modal-button"
        title={title}
        aria-label={title}
        onClick={() => setIsOpen(true)}
      >
        <CircleAlert aria-hidden="true" />
        {label && <span>{label}</span>}
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={title} size="note">
        <div className="note-modal-body">{children}</div>
      </Modal>
    </>
  );
};
