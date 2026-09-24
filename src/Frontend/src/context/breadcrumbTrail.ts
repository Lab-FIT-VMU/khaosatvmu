import { createContext, useContext, useEffect } from 'react';

/*
  Đường dẫn điều hướng của thanh trên cùng.

  Thanh trên cùng in dòng thứ hai theo lối router: vào trang nào thì hiện trang đó,
  đi sâu tiếp xuống cấp dưới thì nối thêm cấp đó. Phần cấp cao nhất (tên hệ thống và
  mục trên thanh điều hướng) thanh trên cùng tự biết; các cấp sâu hơn nằm trong ruột
  từng trang nên chính trang đó phải khai ra — trang Thống kê & Báo cáo biết mình
  đang ở tab nào, đang mở khoa/viện nào.

  Trang không khai gì thì đường dẫn dừng ở mục của thanh điều hướng.
*/
export interface BreadcrumbTrailValue {
  trail: string[];
  setTrail: (segments: string[]) => void;
}

export const BreadcrumbTrailContext = createContext<BreadcrumbTrailValue>({
  trail: [],
  setTrail: () => {},
});

/** Các cấp sâu hơn mà trang hiện tại đã khai, dùng ở thanh trên cùng. */
export const useBreadcrumbTrail = (): string[] => useContext(BreadcrumbTrailContext).trail;

/**
 * Trang khai đường dẫn của mình.
 *
 * Đối chiếu theo CHUỖI chứ không theo mảng: chỗ gọi thường dựng mảng ngay trong thân
 * component nên mỗi lần render lại là một mảng mới, đưa thẳng vào deps thì effect chạy
 * mãi. Rời trang thì trả về rỗng để trang sau không thừa hưởng đường dẫn cũ.
 */
export function useSetBreadcrumbTrail(segments: Array<string | undefined | null>): void {
  const { setTrail } = useContext(BreadcrumbTrailContext);
  const parts = segments.map((segment) => (segment ?? '').trim()).filter(Boolean);
  const key = parts.join('\u001F');

  useEffect(() => {
    setTrail(key === '' ? [] : key.split('\u001F'));
    return () => setTrail([]);
  }, [key, setTrail]);
}
