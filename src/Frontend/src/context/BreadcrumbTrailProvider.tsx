import React, { useCallback, useMemo, useState } from 'react';
import { BreadcrumbTrailContext } from './breadcrumbTrail';

/**
 * Nơi giữ đường dẫn điều hướng hiện tại cho thanh trên cùng.
 *
 * Tách khỏi tệp khai context để tệp này chỉ xuất component — sửa context mà không
 * đụng tới component thì Fast Refresh vẫn giữ nguyên trạng thái trang.
 */
export const BreadcrumbTrailProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [trail, setTrailState] = useState<string[]>([]);
  const setTrail = useCallback((segments: string[]) => setTrailState(segments), []);
  const value = useMemo(() => ({ trail, setTrail }), [trail, setTrail]);

  return (
    <BreadcrumbTrailContext.Provider value={value}>
      {children}
    </BreadcrumbTrailContext.Provider>
  );
};
