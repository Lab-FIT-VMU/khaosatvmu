import React, { useState } from 'react';
import { Image as ImageIcon, LoaderCircle, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '../services/apiClient';
import { surveyApi, surveyErrorMessage } from '../services/surveyApi';
import { surveyHeaderImages } from '../utils/surveyHeaderImages';
import { Modal } from './Modal';

/**
 * Hộp chọn ảnh cho phiếu: ảnh hệ thống cấp sẵn, hoặc ảnh quản trị tự tải lên.
 *
 * Ảnh hệ thống kèm một màu chủ đạo gợi ý theo tên tệp; chọn ảnh thì màu đổi theo, sau
 * đó vẫn đổi màu tay được. Ảnh tự tải lên không gợi ý màu nào.
 */
export const SurveyImagePicker: React.FC<{
  isOpen: boolean;
  title: string;
  /** Ảnh đang dùng, để đánh dấu trong lưới. */
  current?: string | null;
  /** Có cho chọn ảnh hệ thống không; logo thì chỉ tải lên. */
  allowSystemImages?: boolean;
  onChoose: (url: string, suggestedColor: string | null) => void;
  onClose: () => void;
}> = ({ isOpen, title, current, allowSystemImages = true, onChoose, onClose }) => {
  const [tab, setTab] = useState<'system' | 'upload'>(allowSystemImages ? 'system' : 'upload');
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await surveyApi.uploadSurveyFormAsset(file);
      onChoose(url, null);
    } catch (error) {
      toast.error(error instanceof ApiError
        ? surveyErrorMessage(error.errorCode)
        : surveyErrorMessage(null));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="compact">
      <div className="survey-image-picker">
        <nav className="survey-image-picker__tabs">
          {allowSystemImages && (
            <button
              type="button"
              className={`survey-image-picker__tab${tab === 'system' ? ' is-on' : ''}`}
              onClick={() => setTab('system')}
            >
              <ImageIcon className="operation-icon" aria-hidden="true" />
              Ảnh của hệ thống
            </button>
          )}
          <button
            type="button"
            className={`survey-image-picker__tab${tab === 'upload' ? ' is-on' : ''}`}
            onClick={() => setTab('upload')}
          >
            <Upload className="operation-icon" aria-hidden="true" />
            Tải ảnh lên
          </button>
        </nav>

        <div className="survey-image-picker__body">
          {tab === 'system' ? (
            <div className="survey-image-picker__grid">
              {surveyHeaderImages.map((image) => (
                <button
                  type="button"
                  key={image.url}
                  className={`survey-image-picker__item${
                    current === image.url ? ' is-current' : ''
                  }`}
                  onClick={() => onChoose(image.url, image.suggestedColor)}
                >
                  <img src={image.url} alt={image.label} />
                </button>
              ))}
              {surveyHeaderImages.length === 0 && (
                <p className="survey-designer__hint">Hệ thống chưa có ảnh nào.</p>
              )}
            </div>
          ) : (
            <label className="survey-image-picker__upload">
              {uploading ? (
                <>
                  <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
                  Đang tải ảnh lên...
                </>
              ) : (
                <>
                  <Upload className="operation-icon" aria-hidden="true" />
                  Chọn ảnh từ máy — PNG, JPG hoặc WEBP, tối đa 10 MB
                </>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  // Xoá giá trị ô để chọn lại đúng tệp vừa chọn vẫn kích hoạt onChange.
                  event.target.value = '';
                  if (file) void upload(file);
                }}
              />
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
};
