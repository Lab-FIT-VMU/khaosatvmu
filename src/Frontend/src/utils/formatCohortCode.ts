export const formatCohortCode = (value: string | number | null | undefined) => {
  const code = String(value ?? '').trim();
  if (!code) return code;
  return /^k/i.test(code) ? `K${code.slice(1)}` : `K${code}`;
};
