export type DailyBoxOfficeTrigger =
  | 'daily-box-office-midnight'
  | 'daily-box-office-retry'
  | 'daily-box-office-stabilization'
  | 'daily-box-office-noon'
  | 'manual-refresh';

export type DailyBoxOfficeFailurePolicy = 'warn' | 'report' | 'throw';

export type WeeklyBoxOfficeTrigger =
  | 'weekly-box-office-primary'
  | 'weekly-box-office-retry'
  | 'manual-refresh';

export type WeeklyBoxOfficeFailurePolicy = 'warn' | 'report' | 'throw';
